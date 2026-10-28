import io
import json
import tempfile
import unittest
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parents[1]))
from app import create_app
from app.models import db_connection
from app.permissions import required_permission
from werkzeug.security import generate_password_hash


class PermissionTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory(dir=Path(__file__).parent)
        self.addCleanup(self.folder.cleanup)
        self.config = dict(TESTING=True, DATABASE_BACKEND='sqlite', SQLITE_PATH=str(Path(self.folder.name) / 'db.sqlite3'), MODI_RMA_DIR=self.folder.name)
        self.app = create_app(self.config)
        self.app.logger.disabled = True
        self.client = self.app.test_client(use_cookies=False)
        with self.app.app_context(), db_connection() as conn:
            for name, role in [('admin', 'admin'), ('staff', 'normal')]:
                conn.cursor().execute('INSERT INTO RMA_users (username, password_hash, role, department) VALUES (?, ?, ?, ?)', name, generate_password_hash('initial-password'), role, 'Warehouse')
        self.admin = self.login('admin')
        self.staff = self.login('staff')

    def login(self, name):
        result = self.client.post('/auth/api/login', json={'username': name, 'password': 'initial-password'})
        self.assertEqual(result.status_code, 200, result.json)
        return {'Authorization': 'Bearer ' + result.json['token']}

    def permissions(self, actions, department='Warehouse', new_name=None):
        # These regression cases model internal staff; company isolation has its own suite.
        return self.client.patch('/return/admin/departments', headers=self.admin, json={'name': department, 'newName': new_name or department, 'permissions': actions + ['company.all']})

    def test_revoke_and_grant_permissions_affects_existing_tokens(self):
        self.assertEqual(self.permissions([]).status_code, 200)
        self.assertEqual(self.client.get('/return/units', headers=self.staff).status_code, 403)
        self.assertEqual(self.client.post('/return/ship', headers=self.staff, json={}).status_code, 403)
        self.assertEqual(self.client.get('/return/units').status_code, 401)
        self.assertEqual(self.permissions(['return.receive']).status_code, 200)
        session = self.client.get('/auth/api/session', headers=self.staff).json
        self.assertIn('return.view', session['permissions'])
        self.assertEqual(self.client.get('/return/units', headers=self.staff).status_code, 200)
        received = self.client.post('/return/units', headers=self.staff, data={'payload': json.dumps({'receivedDate': '2026-09-30', 'tracking': 'TRACK', 'company': 'Acme', 'quantity': 1, 'units': [{'upc': 'A'}]})})
        self.assertEqual(received.status_code, 201, received.json)
        self.assertEqual(self.permissions(['return.view']).status_code, 200)
        self.assertEqual(self.client.post('/return/units', headers=self.staff).status_code, 403)
        restarted = create_app(self.config).test_client(use_cookies=False)
        self.assertEqual(restarted.post('/return/units', headers=self.staff).status_code, 403)

    def test_existing_departments_do_not_automatically_gain_former_admin_actions(self):
        session = self.client.get('/auth/api/session', headers=self.staff).json
        self.assertIn('return.receive', session['permissions'])
        for action in ('return.edit', 'return.delete', 'return.restore', 'return.export'):
            self.assertNotIn(action, session['permissions'])

    def test_pallet_viewers_can_read_contents_and_shipments_without_changing_them(self):
        received = self.client.post('/return/units', headers=self.admin, data={'payload': json.dumps({
            'receivedDate': '2026-09-30', 'tracking': 'TRACK', 'company': 'Acme', 'quantity': 2, 'units': [{'laptop': 'Shipped unit', 'upc': 'A'}, {'laptop': 'Waiting unit', 'upc': 'B'}],
        })})
        self.assertEqual(received.status_code, 201, received.json)
        first, second = received.json['ids']
        for item in (first, second):
            inspected = self.client.post(f'/return/units/{item}/inspection', headers=self.admin, json={
                'inspectionDate': '2026-09-30', 'serial': f'PALLET-VIEW-{item}', 'pallet': 'P-VIEW',
            })
            self.assertEqual(inspected.status_code, 200, inspected.json)
        shipped = self.client.post('/return/ship', headers=self.admin, json={'shipDate': '2026-09-30', 'unitIds': [first]})
        self.assertEqual(shipped.status_code, 200, shipped.json)

        self.assertEqual(self.client.post('/return/admin/departments', headers=self.admin, json={'name': 'Pallet viewers'}).status_code, 200)
        self.assertEqual(self.permissions(['return.pallet_view'], department='Pallet viewers').status_code, 200)
        assigned = self.client.patch('/return/admin/users', headers=self.admin, json={
            'username': 'staff', 'role': 'normal', 'department': 'Pallet viewers', 'isActive': True,
        })
        self.assertEqual(assigned.status_code, 200, assigned.json)

        pallets = self.client.get('/return/pallets', headers=self.staff)
        self.assertEqual(pallets.status_code, 200, pallets.json)
        self.assertEqual(pallets.json['pallets'], [dict(pallet='P-VIEW', ready=1, shipped=1, total=2, status='OPEN')])
        contents = self.client.get('/return/units?pallet=P-VIEW', headers=self.staff)
        self.assertEqual(contents.status_code, 200, contents.json)
        self.assertEqual({unit['id'] for unit in contents.json['items']}, {first, second})
        detail = self.client.get(f'/return/units/{first}', headers=self.staff)
        self.assertEqual(detail.status_code, 200, detail.json)
        self.assertEqual(detail.json['item']['shipDate'], '2026-09-30')
        self.assertEqual(detail.json['item']['shipBatch'], shipped.json['batchId'])

        self.assertEqual(self.client.post('/return/ship', headers=self.staff, json={'shipDate': '2026-09-30', 'unitIds': [second]}).status_code, 403)
        self.assertEqual(self.client.post('/return/pallet-status', headers=self.staff, json={'pallet': 'P-VIEW', 'status': 'LOCKED'}).status_code, 403)
        self.assertEqual(self.client.patch(f'/return/admin/units/{first}', headers=self.staff, json={'shipDate': ''}).status_code, 403)
        # Record editing must not provide an alternate way to change shipping history.
        self.assertEqual(self.permissions(['return.pallet_view', 'return.edit'], department='Pallet viewers').status_code, 200)
        self.assertEqual(self.client.patch(f'/return/admin/units/{first}', headers=self.staff, json={'shipDate': ''}).status_code, 403)
        self.assertEqual(self.client.get(f'/return/units/{first}', headers=self.staff).json['item']['shipDate'], '2026-09-30')
        self.assertEqual(self.client.get(f'/return/units/{second}', headers=self.staff).json['item']['shipDate'], None)

        self.assertEqual(self.permissions(['return.view'], department='Pallet viewers').status_code, 200)
        self.assertEqual(self.client.get('/return/pallets', headers=self.staff).status_code, 403)

    def test_existing_shipping_and_pallet_managers_keep_pallet_access(self):
        for action in ('return.ship', 'return.pallet_status'):
            with self.subTest(action=action):
                self.assertEqual(self.permissions([action]).status_code, 200)
                session = self.client.get('/auth/api/session', headers=self.staff).json
                self.assertNotIn('return.pallet_view', session['permissions'])
                self.assertEqual(self.client.get('/return/pallets', headers=self.staff).status_code, 200)

    def test_cookie_sessions_protect_photos_and_logout_removes_browser_access(self):
        browser = self.app.test_client()
        logged_in = browser.post('/auth/api/login', json={'username': 'staff', 'password': 'initial-password'})
        self.assertIn('HttpOnly', logged_in.headers['Set-Cookie'])
        self.assertEqual(browser.get('/return/units').status_code, 200)
        self.assertEqual(self.permissions([]).status_code, 200)
        self.assertEqual(browser.get('/images/return_units/test/image.png').status_code, 403)
        self.assertEqual(browser.post('/auth/api/logout').status_code, 200)
        self.assertEqual(browser.get('/return/units').status_code, 401)

    def test_departments_rename_assign_accounts_and_cannot_remove_in_use(self):
        self.assertEqual(self.client.post('/return/admin/departments', headers=self.admin, json={'name': 'Operations'}).status_code, 200)
        self.assertEqual(self.client.post('/return/admin/departments', headers=self.admin, json={'name': 'operations'}).status_code, 409)
        self.assertEqual(self.permissions(['return.view'], new_name='Receiving').status_code, 200)
        self.assertEqual(self.client.get('/auth/api/session', headers=self.staff).json['department'], 'Receiving')
        names = self.client.get('/auth/api/departments', headers=self.admin).json['departments']
        self.assertIn('Receiving', names)
        self.assertNotIn('Warehouse', names)
        self.assertEqual(self.client.delete('/return/admin/departments', headers=self.admin, json={'name': 'Receiving'}).status_code, 400)
        result = self.client.patch('/return/admin/users', headers=self.admin, json={'username': 'staff', 'role': 'normal', 'department': 'Operations', 'isActive': True})
        self.assertEqual(result.status_code, 200, result.json)
        self.assertEqual(self.client.get('/return/units', headers=self.staff).status_code, 403)
        self.assertEqual(self.client.get('/return/units', headers=self.admin).status_code, 200)
        self.assertEqual(self.client.patch('/return/admin/users', headers=self.admin, json={'username': 'staff', 'role': 'normal', 'department': 'Missing', 'isActive': True}).status_code, 400)

    def test_staff_cannot_change_permissions_even_when_sending_admin_role(self):
        response = self.client.patch('/return/admin/departments', headers=self.staff, json={'name': 'Warehouse', 'permissions': ['return.ship'], 'role': 'admin'})
        self.assertEqual(response.status_code, 403)
        self.assertEqual(self.client.post('/auth/api/register', json={'username': 'new', 'password': 'pass', 'department': 'Missing'}).status_code, 400)
        self.assertEqual(self.permissions(['admin']).status_code, 400)

    def test_granular_edit_delete_and_photo_permissions_cannot_be_bypassed(self):
        item = self.client.post('/return/units', headers=self.admin, data={'payload': json.dumps({'receivedDate': '2026-09-30', 'tracking': 'TRACK', 'company': 'Acme', 'quantity': 1, 'units': [{'upc': 'A'}]})}).json['ids'][0]
        self.assertEqual(self.permissions(['return.edit', 'pc.create']).status_code, 200)
        edited = self.client.patch(f'/return/admin/units/{item}', headers=self.staff, json={'laptop': 'Edited by permitted staff'})
        self.assertEqual(edited.status_code, 200, edited.json)
        self.assertEqual(self.client.patch(f'/return/admin/units/{item}', headers=self.staff, json={'serial': 'SN', 'inspectionDate': '2026-09-30'}).status_code, 403)
        self.assertEqual(self.client.delete(f'/return/admin/units/{item}', headers=self.staff, json={'confirmFileNo': 'sid-0001'}).status_code, 403)
        self.assertEqual(self.client.post('/laptop/item/submit', headers=self.staff, data={'images': (io.BytesIO(b'image'), 'test.png')}).status_code, 403)
        self.assertEqual(self.client.post(f'/return/units/{item}/photos', headers=self.staff, data={'images': (io.BytesIO(b'image'), 'test.png')}).status_code, 403)
        disabled = self.client.patch('/return/admin/users', headers=self.admin, json={'username': 'staff', 'role': 'normal', 'department': 'Warehouse', 'isActive': False})
        self.assertEqual(disabled.status_code, 200)
        self.assertEqual(self.client.get('/return/units', headers=self.staff).status_code, 401)

    def test_every_nonpublic_endpoint_has_an_explicit_permission(self):
        public = {'auth.login', 'auth.register', 'auth.departments', 'auth.logout', 'static'}
        for rule in self.app.url_map.iter_rules():
            if rule.endpoint in public: continue
            path = rule.rule.replace('<type>', 'laptop')
            import re
            path = re.sub(r'<[^>]+>', '1', path)
            method = next(method for method in sorted(rule.methods) if method not in ('OPTIONS', 'HEAD'))
            with self.app.test_request_context(path, method=method):
                self.assertIsNotNone(required_permission(), rule.endpoint)
