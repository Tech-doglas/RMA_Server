import logging
import os
import sqlite3
import sys
import tempfile
import unittest
from contextlib import closing
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parents[1]))
from app.local_database import initialize_local_database
from nas_wsgi import create_nas_app
from werkzeug.security import generate_password_hash


class NasDeploymentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.password_hash = generate_password_hash('nas-test-password')

    def setUp(self):
        self.folder = tempfile.TemporaryDirectory(dir=Path(__file__).parent)
        self.addCleanup(self.folder.cleanup)
        self.root = Path(self.folder.name)
        self.path = self.root / 'rma.sqlite3'
        environment = patch.dict(os.environ, {
            'DATABASE_BACKEND': 'sqlite', 'SQLITE_PATH': str(self.path),
            'MODI_RMA_DIR': str(self.root), 'RMA_LOG_DIR': str(self.root / 'logs'),
            'RMA_SECRET_KEY': '', 'RMA_TRUSTED_ORIGINS': '',
        })
        environment.start()
        self.addCleanup(environment.stop)
        logger = logging.getLogger('app')
        original_handlers = set(logger.handlers)

        def close_test_logs():
            for handler in list(logger.handlers):
                if handler not in original_handlers:
                    logger.removeHandler(handler)
                    handler.close()
        self.addCleanup(close_test_logs)

    def start(self):
        initialize_local_database(str(self.path))
        with closing(sqlite3.connect(self.path)) as conn, conn:
            conn.execute('INSERT INTO RMA_users (username,password_hash,role,department) VALUES (?,?,?,?)',
                         ('nas-admin', self.password_hash, 'admin', 'IT'))
        self.app = create_nas_app()
        self.app.config['TESTING'] = True
        self.app.logger.disabled = True
        return self.app.test_client()

    def test_missing_or_empty_database_fails_without_creating_replacement(self):
        with self.assertRaisesRegex(RuntimeError, 'existing database is missing'):
            create_nas_app()
        self.assertFalse(self.path.exists())
        self.path.touch()
        with self.assertRaisesRegex(RuntimeError, 'existing database is missing'):
            create_nas_app()
        self.assertEqual(self.path.stat().st_size, 0)

    def test_unknown_configuration_is_rejected(self):
        with patch.dict(os.environ, {'DATABASE_BACKEND': 'unknown'}):
            with self.assertRaisesRegex(RuntimeError, 'sqlite or mssql'):
                create_nas_app()

    def test_mssql_requires_explicit_credentials_without_creating_sqlite(self):
        with patch.dict(os.environ, {'DATABASE_BACKEND': 'mssql', 'SQL_PASSWORD': ''}):
            with self.assertRaisesRegex(RuntimeError, 'SQL_PASSWORD'):
                create_nas_app()
        self.assertFalse(self.path.exists())

    def test_mssql_checks_schema_and_never_initializes_sqlite(self):
        settings = {'DATABASE_BACKEND': 'mssql', 'SQL_SERVER': 'test-sql',
                    'SQL_DATABASE': 'RMA', 'SQL_USER': 'test', 'SQL_PASSWORD': 'test-only'}
        with patch.dict(os.environ, settings), \
                patch('app.sqlserver_check.check_schema') as check, \
                patch('app.local_database.initialize_local_database') as initialize:
            app = create_nas_app()
            self.assertEqual(app.config['DATABASE_BACKEND'], 'mssql')
            check.assert_called_once_with()
            initialize.assert_not_called()
            check.side_effect = RuntimeError('schema incompatible')
            with self.assertRaisesRegex(RuntimeError, 'schema incompatible'):
                create_nas_app()
        self.assertFalse(self.path.exists())

    def test_lan_proxy_preserves_port_origin_and_blocks_unrelated_origin(self):
        client = self.start()
        headers = {'Host': 'nas.example:3001', 'Origin': 'http://nas.example:3001',
                   'X-Forwarded-Proto': 'http', 'X-Forwarded-Prefix': '/api',
                   'X-Forwarded-For': '192.0.2.4',
                   'X-Forwarded-Host': 'untrusted.example', 'X-Forwarded-Port': '9999'}
        response = client.get('/auth/api/departments', headers=headers)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers['Access-Control-Allow-Origin'], headers['Origin'])
        headers['Origin'] = 'https://untrusted.example'
        self.assertEqual(client.get('/auth/api/departments', headers=headers).status_code, 403)

    def test_https_login_sets_secure_cookie_and_photos_require_login(self):
        client = self.start()
        headers = {'Host': 'rma.example', 'Origin': 'https://rma.example',
                   'X-Forwarded-Proto': 'https', 'X-Forwarded-Prefix': '/api',
                   'X-Forwarded-For': '192.0.2.4'}
        self.assertEqual(client.get('/images/return_units/1/example.jpg', headers=headers).status_code, 401)
        response = client.post('/auth/api/login', headers=headers,
                               json={'username': 'nas-admin', 'password': 'nas-test-password'})
        self.assertEqual(response.status_code, 200)
        self.assertIn('Secure;', response.headers['Set-Cookie'])
        self.assertIn('HttpOnly;', response.headers['Set-Cookie'])
        self.assertIn('Strict-Transport-Security', response.headers)
        self.assertEqual(client.get('/auth/api/session', headers=headers).status_code, 200)

    def test_restart_preserves_accounts_and_signing_key(self):
        self.start()
        key = (self.root / '.session-key').read_text()
        create_nas_app()
        self.assertEqual((self.root / '.session-key').read_text(), key)
        with closing(sqlite3.connect(self.path)) as conn:
            self.assertEqual(conn.execute('SELECT username FROM RMA_users').fetchall(), [('nas-admin',)])


if __name__ == '__main__':
    unittest.main()
