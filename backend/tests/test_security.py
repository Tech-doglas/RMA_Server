import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parents[1]))
from app import create_app
from app.models import db_connection
from werkzeug.security import generate_password_hash


class SecurityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.password_hash = generate_password_hash('security-test-password')

    def setUp(self):
        self.folder = tempfile.TemporaryDirectory(dir=Path(__file__).parent)
        self.addCleanup(self.folder.cleanup)
        self.config = dict(TESTING=True, DATABASE_BACKEND='sqlite', SQLITE_PATH=str(Path(self.folder.name) / 'db.sqlite3'), MODI_RMA_DIR=self.folder.name)
        self.app = create_app(self.config)
        self.app.logger.disabled = True
        self.client = self.app.test_client()
        with self.app.app_context(), db_connection() as conn:
            conn.cursor().execute('INSERT INTO RMA_users (username, password_hash, role, department) VALUES (?, ?, ?, ?)', 'secure-admin', self.password_hash, 'admin', 'IT')

    def login(self):
        response = self.client.post('/auth/api/login', json={'username': 'secure-admin', 'password': 'security-test-password'})
        self.assertEqual(response.status_code, 200, response.json)
        return response.json['token']

    def test_origin_boundary_accepts_frontend_and_rejects_other_websites(self):
        valid = self.client.options('/return/ship', headers={'Origin': 'http://localhost:3000', 'Access-Control-Request-Method': 'POST'})
        self.assertEqual(valid.status_code, 204)
        self.assertEqual(valid.headers['Access-Control-Allow-Origin'], 'http://localhost:3000')
        for origin in ['https://untrusted.example', 'null', 'http://localhost:9999']:
            denied = self.client.post('/auth/api/login', headers={'Origin': origin}, json={'username': 'secure-admin', 'password': 'security-test-password'})
            self.assertEqual(denied.status_code, 403)
            self.assertNotIn('Access-Control-Allow-Origin', denied.headers)
        self.assertEqual(self.client.get('/return/units', headers={'Sec-Fetch-Site': 'cross-site'}).status_code, 403)

    def test_logout_revokes_token_copies_and_keeps_other_login_valid(self):
        first = self.login()
        second = self.login()
        self.assertNotEqual(first, second)
        response = self.client.post('/auth/api/logout', headers={'Authorization': 'Bearer ' + first})
        self.assertEqual(response.status_code, 200)
        restarted = create_app(self.config).test_client(use_cookies=False)
        self.assertEqual(restarted.get('/return/units', headers={'Authorization': 'Bearer ' + first}).status_code, 401)
        self.assertEqual(restarted.get('/return/units', headers={'Authorization': 'Bearer ' + second}).status_code, 200)

    def test_throttle_stops_password_checks_after_repeated_failures(self):
        with patch('app.routes.Auth.check_password_hash', return_value=False) as checker:
            for _ in range(8):
                self.assertEqual(self.client.post('/auth/api/login', json={'username': 'secure-admin', 'password': 'wrong'}).status_code, 401)
            blocked = self.client.post('/auth/api/login', json={'username': 'secure-admin', 'password': 'wrong'})
            self.assertEqual(blocked.status_code, 429)
            self.assertGreater(int(blocked.headers['Retry-After']), 0)
            self.assertEqual(checker.call_count, 8)

    def test_malformed_login_and_short_registration_are_validation_errors(self):
        for payload in [[], {}, {'username': ['admin'], 'password': 'password'}, {'username': 'admin', 'password': 'x' * 256}]:
            self.assertEqual(self.client.post('/auth/api/login', json=payload).status_code, 400)
        response = self.client.post('/auth/api/register', json={'username': 'new', 'password': 'short', 'department': 'IT'})
        self.assertEqual(response.status_code, 400)
        self.assertIn('12', response.json['error'])

    def test_cookie_login_and_headers_and_json_size_limit(self):
        self.login()
        response = self.client.get('/return/units')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers['Cache-Control'], 'no-store')
        self.assertEqual(response.headers['X-Content-Type-Options'], 'nosniff')
        large = self.client.post('/auth/api/login', data=' ' * (2 * 1024 * 1024 + 1), content_type='application/json')
        self.assertEqual(large.status_code, 413)
        self.assertTrue(large.is_json)


if __name__ == '__main__':
    unittest.main()
