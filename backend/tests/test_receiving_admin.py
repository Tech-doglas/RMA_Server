import json
import sys
import tempfile
import unittest
from contextlib import closing
from pathlib import Path
from werkzeug.security import generate_password_hash

sys.path.insert(0, str(Path(__file__).parents[1]))
from app import create_app
from app.models import db_connection


class ReceivingAdminTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory(dir=Path(__file__).parent)
        self.addCleanup(self.folder.cleanup)
        self.config = dict(TESTING=True, DATABASE_BACKEND='sqlite',
                           SQLITE_PATH=str(Path(self.folder.name) / 'rma.sqlite3'), MODI_RMA_DIR=self.folder.name)
        self.app = create_app(self.config)
        self.app.logger.disabled = True
        self.client = self.app.test_client(use_cookies=False)
        with self.app.app_context(), db_connection() as conn:
            cursor = conn.cursor()
            for username, role in [('admin-test', 'admin'), ('staff-test', 'normal')]:
                cursor.execute('INSERT INTO RMA_users (username, password_hash, role, department) VALUES (?, ?, ?, ?)',
                               username, generate_password_hash('initial-password'), role, 'IT')
        token = self.client.post('/auth/api/login', json={'username': 'admin-test', 'password': 'initial-password'}).json['token']
        self.headers = {'Authorization': 'Bearer ' + token}
        self.client.environ_base['HTTP_AUTHORIZATION'] = 'Bearer ' + token
        received = self.client.post('/return/units', data={'payload': json.dumps({
            'tracking': 'ADMIN-GROUP', 'receivedDate': '2026-09-30', 'units': [{'laptop': 'Dell'}, {'laptop': 'Lenovo'}],
        })})
        self.first, self.second = received.json['ids']

    def call(self, path, method='POST', payload=None, headers=None):
        return self.client.open('/return' + path, method=method, json=payload,
                                headers=self.headers if headers is None else {'Authorization': '', **headers})

    def test_admin_permissions_are_verified_on_server(self):
        for path, method in [('/admin/types', 'POST'), (f'/admin/units/{self.first}', 'PATCH'), (f'/admin/units/{self.first}', 'DELETE')]:
            self.assertEqual(self.call(path, method, {'name': 'REPAIR'}, headers={}).status_code, 401)
            self.assertEqual(self.call(path, method, {}, headers={'Authorization': 'Bearer fake-admin-token'}).status_code, 401)
        login = self.client.post('/auth/api/login', json={'username': 'staff-test', 'password': 'initial-password'})
        self.assertEqual(self.call('/admin/types', payload={'name': 'REPAIR'}, headers={'Authorization': 'Bearer ' + login.json['token']}).status_code, 403)
        self.assertEqual(self.client.post('/auth/api/register', json={'username': 'fake-admin', 'password': 'test', 'department': 'IT', 'role': 'admin'}).status_code, 403)

    def test_types_rename_remove_existing_records_and_persist_after_restart(self):
        self.assertEqual(self.call('/admin/types', payload={'name': ' repair '}).status_code, 200)
        self.assertEqual(self.call('/admin/types', payload={'name': 'REPAIR'}).status_code, 409)
        self.assertEqual(self.client.post(f'/return/units/{self.first}/bulk-type', json={'bulkType': 'REPAIR'}).json['updatedCount'], 2)
        self.assertEqual(self.call('/admin/types', 'PATCH', {'name': 'REPAIR', 'replacement': 'REFURBISHED'}).status_code, 200)
        self.assertEqual(self.client.get(f'/return/units/{self.second}').json['item']['bulkType'], 'REFURBISHED')
        removed = self.call('/admin/types', 'DELETE', {'name': 'REFURBISHED', 'replacement': 'REGULAR'})
        self.assertEqual(removed.status_code, 200)
        self.assertEqual(self.client.get(f'/return/units/{self.second}').json['item']['bulkType'], 'REGULAR')
        self.assertEqual(self.call('/admin/types', 'DELETE', {'name': 'REGULAR', 'replacement': 'BULK_NEW'}).status_code, 400)
        self.assertEqual(self.call('/admin/types', 'DELETE', {'name': 'BULK_NEW', 'replacement': 'REGULAR'}).status_code, 200)
        restarted = create_app(self.config).test_client()
        result = restarted.get('/return/admin/types', headers=self.headers)
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json['bulkTypes'], ['REGULAR'])
        self.assertEqual(self.client.post(f'/return/units/{self.first}/bulk-type', json={'bulkType': 'BULK_NEW'}).status_code, 400)

    def test_company_options_require_admin_and_update_old_records(self):
        self.assertEqual(self.call('/admin/companies', payload={'name': 'ACME'}, headers={}).status_code, 401)
        token = self.client.post('/auth/api/login', json={'username': 'staff-test', 'password': 'initial-password'}).json['token']
        self.assertEqual(self.call('/admin/companies', payload={'name': 'ACME'}, headers={'Authorization': 'Bearer ' + token}).status_code, 403)
        self.assertEqual(self.call('/admin/companies', payload={'name': ' ACME '}).status_code, 200)
        self.assertEqual(self.call('/admin/companies', payload={'name': 'acme'}).status_code, 409)
        self.call(f'/admin/units/{self.first}', 'PATCH', {'company': 'ACME'})
        self.call(f'/admin/units/{self.second}', 'PATCH', {'company': 'ACME'})
        renamed = self.call('/admin/companies', 'PATCH', {'name': 'ACME', 'replacement': 'Acme Logistics'})
        self.assertEqual(renamed.status_code, 200, renamed.json)
        listing = self.client.get('/return/units').json
        self.assertIn('Acme Logistics', listing['companies'])
        self.assertNotIn('ACME', listing['companies'])
        filtered = self.call('/admin/records?company=Acme%20Logistics', 'GET').json
        self.assertEqual(filtered['total'], 2)
        self.assertIn('Acme Logistics', filtered['companies'])
        self.assertNotIn('ACME', filtered['companies'])
        self.assertEqual(self.client.get(f'/return/units/{self.second}').json['item']['company'], 'Acme Logistics')
        self.assertEqual(self.call('/admin/companies', 'DELETE', {'name': 'Acme Logistics'}).status_code, 400)
        self.assertEqual(self.call('/admin/companies', 'DELETE', {'name': 'Acme Logistics', 'replacement': 'missing'}).status_code, 400)
        removed = self.call('/admin/companies', 'DELETE', {'name': 'Acme Logistics', 'replacement': 'Others'})
        self.assertEqual(removed.status_code, 200, removed.json)
        self.assertEqual(self.client.get(f'/return/units/{self.first}').json['item']['company'], 'Others')
        self.assertEqual(self.call('/admin/companies', 'DELETE', {'name': 'Others', 'replacement': ''}).status_code, 200)
        self.assertEqual(self.client.get(f'/return/units/{self.second}').json['item']['company'], '')
        restarted = create_app(self.config).test_client()
        self.assertNotIn('Others', restarted.get('/return/companies', headers=self.headers).json['companies'])
        self.assertNotIn('Acme Logistics', restarted.get('/return/companies', headers=self.headers).json['companies'])

    def test_admin_edits_and_bulk_assignment_cannot_add_to_closed_pallets(self):
        self.assertEqual(self.call(f'/admin/units/{self.first}', 'PATCH', {'pallet': 'P1'}).status_code, 200)
        self.assertEqual(self.client.post('/return/pallet-status', json={'pallet': 'P1', 'status': 'LOCKED'}).status_code, 200)
        self.assertEqual(self.call(f'/admin/units/{self.second}', 'PATCH', {'pallet': 'P1'}).status_code, 400)
        self.assertEqual(self.call('/admin/bulk', payload={'unitIds': [self.first, self.second], 'action': 'pallet', 'value': 'P1'}).status_code, 400)
        self.assertEqual(self.call(f'/admin/units/{self.first}', 'PATCH', {'laptop': 'Still editable', 'pallet': 'P1'}).status_code, 200)
        self.assertEqual(self.client.get(f'/return/units/{self.second}').json['item']['pallet'], '')

    def test_record_edits_keep_id_validate_serial_and_record_history(self):
        updated = self.call(f'/admin/units/{self.first}', 'PATCH', {'laptop': 'Updated Dell', 'serial': 'ADMIN-SERIAL', 'inspectionDate': '2026-09-30', 'pallet': 'P1', 'bulkType': 'BULK_NEW'})
        self.assertEqual(updated.status_code, 200, updated.json)
        item = self.client.get(f'/return/units/{self.first}').json['item']
        self.assertEqual(item['fileNo'], 'sid-0001')
        self.assertEqual(item['laptop'], 'Updated Dell')
        self.assertEqual(self.client.get(f'/return/units/{self.second}').json['item']['bulkType'], 'BULK_NEW')
        self.assertEqual(self.call(f'/admin/units/{self.second}', 'PATCH', {'serial': 'admin-serial'}).status_code, 400)
        self.assertEqual(self.call(f'/admin/units/{self.first}', 'PATCH', {'shipDate': '2026-09-30'}).status_code, 400)
        self.assertEqual(self.call(f'/admin/units/{self.first}', 'PATCH', {'receivedDate': ''}).status_code, 400)
        with self.app.app_context(), db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT username, action, snapshot FROM RMA_return_admin_audit')
            account, action, snapshot = cursor.fetchone()
            self.assertEqual((account, action), ('admin-test', 'edit unit'))
            self.assertEqual(json.loads(snapshot)['laptop'], 'Dell')

    def test_delete_requires_file_number_and_keeps_other_unit_and_history(self):
        path = f'/admin/units/{self.first}'
        self.assertEqual(self.call(path, 'DELETE', {'confirmFileNo': 'wrong'}).status_code, 400)
        self.assertEqual(self.call(path, 'DELETE', {'confirmFileNo': 'sid-0001'}).status_code, 200)
        self.assertEqual(self.client.get(f'/return/units/{self.first}').status_code, 404)
        self.assertEqual(self.client.get(f'/return/units/{self.second}').json['item']['groupSize'], 1)
        self.assertEqual(self.client.get('/return/monthly-report').json['totals']['received'], 1)
        with self.app.app_context(), db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT snapshot FROM RMA_return_admin_audit WHERE action = ?', 'remove unit')
            self.assertEqual(json.loads(cursor.fetchone()[0])['fileNo'], 'sid-0001')

    def test_password_change_revokes_old_session(self):
        self.assertEqual(self.call('/admin/password', payload={'currentPassword': 'wrong', 'newPassword': 'new-admin-password'}).status_code, 400)
        self.assertEqual(self.call('/admin/password', payload={'currentPassword': 'initial-password', 'newPassword': 'new-admin-password'}).status_code, 200)
        self.assertEqual(self.call('/admin/types', 'GET').status_code, 401)
        login = self.client.post('/auth/api/login', json={'username': 'admin-test', 'password': 'new-admin-password'})
        self.assertEqual(login.status_code, 200)
        self.assertEqual(self.call('/admin/types', 'GET', headers={'Authorization': 'Bearer ' + login.json['token']}).status_code, 200)

    def test_search_pagination_filters_overview_and_export(self):
        result = self.call('/admin/records?pageSize=1', 'GET')
        self.assertEqual(result.status_code, 200, result.json)
        self.assertEqual(result.json['total'], 2)
        self.assertEqual(result.json['items'][0]['id'], self.second)
        self.assertEqual(self.call('/admin/records?pageSize=1&page=2', 'GET').json['items'][0]['id'], self.first)
        self.assertEqual(self.call('/admin/records?q=sid-0001', 'GET').json['total'], 1)
        self.assertEqual(self.call('/admin/records?q=Lenovo&status=awaiting', 'GET').json['total'], 1)
        self.assertEqual(self.call('/admin/records?status=shipped', 'GET').json['total'], 0)
        self.assertEqual(self.call('/admin/records?from=2026-10-01', 'GET').json['total'], 0)
        totals = self.call('/admin/overview', 'GET').json['totals']
        self.assertEqual((totals['received'], totals['awaitingInspection'], totals['activeAccounts']), (2, 2, 2))
        exported = self.call('/admin/export', 'GET').json
        self.assertEqual(len(exported['units']), 2)
        self.assertNotIn('password_hash', json.dumps(exported))
        history = self.call('/admin/history?action=export%20returns', 'GET').json
        self.assertEqual(history['total'], 1)

    def test_bulk_type_includes_tracking_siblings_and_pallet_rejects_shipped(self):
        result = self.call('/admin/bulk', payload={'action': 'type', 'unitIds': [self.first], 'value': 'BULK_NEW'})
        self.assertEqual(result.json['updatedCount'], 2)
        self.assertEqual(self.client.get(f'/return/units/{self.second}').json['item']['bulkType'], 'BULK_NEW')
        self.assertEqual(self.call('/admin/history?action=bulk%20type', 'GET').json['total'], 2)
        self.assertEqual(self.call('/admin/bulk', payload={'action': 'pallet', 'unitIds': [self.first, self.second], 'value': 'P2'}).status_code, 200)
        self.client.post(f'/return/units/{self.first}/inspection', json={'serial': 'BULK-SERIAL', 'inspectionDate': '2026-09-30', 'pallet': 'P2'})
        self.client.post('/return/ship', json={'unitIds': [self.first], 'shipDate': '2026-09-30'})
        blocked = self.call('/admin/bulk', payload={'action': 'pallet', 'unitIds': [self.first, self.second], 'value': 'P3'})
        self.assertEqual(blocked.status_code, 400)
        self.assertEqual(self.client.get(f'/return/units/{self.second}').json['item']['pallet'], 'P2')

    def test_bulk_remove_confirm_restore_id_photos_and_serial_conflict(self):
        self.call(f'/admin/units/{self.first}', 'PATCH', {'serial': 'RESTORE-SERIAL', 'inspectionDate': '2026-09-30'})
        payload = {'action': 'remove', 'unitIds': [self.first], 'confirmation': 'wrong'}
        self.assertEqual(self.call('/admin/bulk', payload=payload).status_code, 400)
        payload['confirmation'] = 'REMOVE 1'
        self.assertEqual(self.call('/admin/bulk', payload=payload).status_code, 200)
        removed = self.call('/admin/trash', 'GET').json
        self.assertEqual(removed['total'], 1)
        event_id = removed['items'][0]['id']
        self.call(f'/admin/units/{self.second}', 'PATCH', {'serial': 'RESTORE-SERIAL'})
        self.assertEqual(self.call(f'/admin/restore/{event_id}', payload={}).status_code, 400)
        self.call(f'/admin/units/{self.second}', 'PATCH', {'serial': ''})
        restored = self.call(f'/admin/restore/{event_id}', payload={})
        self.assertEqual(restored.status_code, 200, restored.json)
        self.assertEqual(restored.json['fileNo'], 'sid-0001')
        self.assertEqual(self.client.get(f'/return/units/{self.first}').json['item']['serial'], 'RESTORE-SERIAL')
        self.assertEqual(self.call('/admin/trash', 'GET').json['total'], 0)
        self.assertEqual(self.call(f'/admin/restore/{event_id}', payload={}).status_code, 400)

    def test_account_roles_disable_reset_and_self_protection(self):
        payload = dict(username='new-staff', password='long-initial-password', role='normal', department='Tech', isActive=True)
        self.assertEqual(self.call('/admin/users', payload=payload).status_code, 200)
        self.assertEqual(self.call('/admin/users', payload=payload).status_code, 409)
        self.assertNotIn('password_hash', json.dumps(self.call('/admin/users', 'GET').json))
        self.assertEqual(self.call('/admin/users', 'PATCH', dict(payload, username='admin-test', role='normal')).status_code, 400)
        self.assertEqual(self.call('/admin/users', 'PATCH', dict(payload, username='admin-test', role='admin', isActive=False)).status_code, 400)
        self.assertEqual(self.call('/admin/users', 'PATCH', dict(payload, role='admin', password='')).status_code, 200)
        login = self.client.post('/auth/api/login', json={'username': 'new-staff', 'password': payload['password']})
        user_headers = {'Authorization': 'Bearer ' + login.json['token']}
        self.assertEqual(self.call('/admin/overview', 'GET', headers=user_headers).status_code, 200)
        self.assertEqual(self.call('/admin/users', 'PATCH', dict(payload, role='admin', isActive=False, password='')).status_code, 200)
        self.assertEqual(self.client.post('/auth/api/login', json={'username': 'new-staff', 'password': payload['password']}).status_code, 401)
        self.assertEqual(self.call('/admin/overview', 'GET', headers=user_headers).status_code, 401)
        self.assertEqual(self.call('/admin/users', 'PATCH', dict(payload, password='changed-user-password')).status_code, 200)
        self.assertEqual(self.client.post('/auth/api/login', json={'username': 'new-staff', 'password': 'changed-user-password'}).status_code, 200)
        self.assertEqual(self.call('/admin/overview', 'GET', headers=user_headers).status_code, 401)

    def test_backup_contains_database_and_new_routes_require_admin(self):
        for path, method in [('/admin/overview', 'GET'), ('/admin/records', 'GET'), ('/admin/users', 'GET'),
                             ('/admin/history', 'GET'), ('/admin/trash', 'GET'), ('/admin/export', 'GET'),
                             ('/admin/backup', 'POST'), ('/admin/bulk', 'POST'), ('/admin/restore/1', 'POST')]:
            self.assertEqual(self.call(path, method, headers={}).status_code, 401)
        result = self.call('/admin/backup', payload={})
        self.assertEqual(result.status_code, 200)
        import sqlite3
        with closing(sqlite3.connect(Path(self.folder.name) / 'backups' / result.json['filename'])) as copied:
            self.assertEqual(copied.execute('SELECT COUNT(*) FROM RMA_return_units').fetchone()[0], 2)

    def test_removing_shipped_units_does_not_reuse_shipping_batch_numbers(self):
        for unit_id in [self.first, self.second]:
            self.client.post(f'/return/units/{unit_id}/inspection', json={'serial': 'SHIP-' + str(unit_id), 'inspectionDate': '2026-09-30'})
        first_shipment = self.client.post('/return/ship', json={'unitIds': [self.first], 'shipDate': '2026-09-30'})
        self.assertEqual(first_shipment.json['batchId'], 'ship.0001')
        self.call(f'/admin/units/{self.first}', 'DELETE', {'confirmFileNo': 'sid-0001'})
        next_shipment = self.client.post('/return/ship', json={'unitIds': [self.second], 'shipDate': '2026-09-30'})
        self.assertEqual(next_shipment.json['batchId'], 'ship.0002')
        event = self.call('/admin/trash', 'GET').json['items'][0]['id']
        self.assertEqual(self.call(f'/admin/restore/{event}', payload={}).status_code, 200)
        self.assertEqual(self.client.get(f'/return/units/{self.first}').json['item']['shipBatch'], 'ship.0001')

    def test_public_registration_requires_admin_approval_and_cannot_bypass_it(self):
        account = dict(username='pending-user', password='registered-password', department='Tech', role='manager', approvalStatus='approved', isActive=True)
        registered = self.client.post('/auth/api/register', json=account)
        self.assertEqual(registered.json['approvalStatus'], 'pending')
        denied = self.client.post('/auth/api/login', json=account)
        self.assertEqual(denied.status_code, 403)
        self.assertNotIn('token', denied.json)
        users = self.call('/admin/users', 'GET').json['users']
        pending = next(user for user in users if user['username'] == 'pending-user')
        self.assertEqual((pending['role'], pending['approvalStatus']), ('normal', 'pending'))
        self.assertEqual(self.call('/admin/overview', 'GET').json['totals']['pendingRegistrations'], 1)
        self.call('/admin/users', 'PATCH', dict(account, role='normal', password=''))
        self.assertEqual(self.client.post('/auth/api/login', json=account).status_code, 403)
        self.assertEqual(self.call('/admin/users/approval', payload={'username': 'pending-user', 'decision': 'approve'}, headers={}).status_code, 401)
        staff = self.client.post('/auth/api/login', json={'username': 'staff-test', 'password': 'initial-password'}).json
        self.assertEqual(self.call('/admin/users/approval', payload={'username': 'pending-user', 'decision': 'approve'}, headers={'Authorization': 'Bearer ' + staff['token']}).status_code, 403)
        self.assertEqual(self.call('/admin/users/approval', payload={'username': 'pending-user', 'decision': 'approve'}).status_code, 200)
        self.assertEqual(self.client.post('/auth/api/login', json=account).status_code, 200)
        self.assertEqual(self.call('/admin/history?action=approve%20registration', 'GET').json['total'], 1)

    def test_rejected_registration_cannot_log_in_and_can_be_approved_later(self):
        account = dict(username='rejected-user', password='registered-password', department='IT')
        self.client.post('/auth/api/register', json=account)
        self.assertEqual(self.call('/admin/users/approval', payload={'username': account['username'], 'decision': 'reject'}).status_code, 200)
        rejected = self.client.post('/auth/api/login', json=account)
        self.assertEqual(rejected.status_code, 403)
        self.assertIn('declined', rejected.json['error'])
        restarted = create_app(self.config).test_client()
        self.assertEqual(restarted.post('/auth/api/login', json=account).status_code, 403)
        self.assertEqual(self.call('/admin/users/approval', payload={'username': account['username'], 'decision': 'approve'}).status_code, 200)
        self.assertEqual(self.client.post('/auth/api/login', json=account).status_code, 200)
        self.assertEqual(self.call('/admin/users/approval', payload={'username': 'admin-test', 'decision': 'reject'}).status_code, 400)

    def test_admin_can_disable_other_admin_and_change_role(self):
        account = dict(username='other-admin', password='other-admin-password', role='admin', department='IT', isActive=True)
        self.assertEqual(self.call('/admin/users', payload=account).status_code, 200)
        login = self.client.post('/auth/api/login', json=account)
        old_headers = {'Authorization': 'Bearer ' + login.json['token']}
        self.assertEqual(self.call('/admin/users', 'PATCH', dict(account, isActive=False, password='')).status_code, 200)
        self.assertEqual(self.client.post('/auth/api/login', json=account).status_code, 401)
        self.assertEqual(self.call('/admin/overview', 'GET', headers=old_headers).status_code, 401)
        self.assertEqual(self.call('/admin/users', 'PATCH', dict(account, role='manager', password='')).status_code, 200)
        self.assertEqual(self.client.post('/auth/api/login', json=account).json['role'], 'manager')
        self.assertEqual(self.call('/admin/overview', 'GET', headers=old_headers).status_code, 403)

    def test_named_admin_role_and_status_cannot_be_changed_by_another_admin(self):
        account = dict(username='admin', password='primary-admin-password', role='admin', department='IT', isActive=True)
        self.assertEqual(self.call('/admin/users', payload=account).status_code, 200)
        for changes in [dict(role='normal'), dict(role='manager'), dict(isActive=False)]:
            rejected = self.call('/admin/users', 'PATCH', dict(account, password='', **changes))
            self.assertEqual(rejected.status_code, 400)
            self.assertIn('fixed', rejected.json['error'])
        self.assertEqual(self.call('/admin/users', 'PATCH', dict(account, username='ADMIN', role='manager', password='')).status_code, 400)
        users = self.call('/admin/users', 'GET').json['users']
        primary = next(user for user in users if user['username'] == 'admin')
        self.assertEqual((primary['role'], primary['isActive']), ('admin', 1))
        self.assertEqual(self.call('/admin/users', 'PATCH', dict(account, department='Tech', password='')).status_code, 200)


if __name__ == '__main__':
    unittest.main()
