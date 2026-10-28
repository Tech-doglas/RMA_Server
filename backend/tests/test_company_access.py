"""Cross-company isolation uses authenticated requests and a temporary database."""
import io
import json
import unittest
import test_permissions as permission_tests
from app.models import db_connection
from app.company_access import company_key
from PIL import Image


class CompanyAccessTests(unittest.TestCase):
    setUp = permission_tests.PermissionTests.setUp
    login = permission_tests.PermissionTests.login

    def configure(self, companies, actions=None):
        actions = actions or ['return.view', 'return.receive', 'return.photos', 'return.inspect',
            'return.classify', 'return.pallet_view', 'return.pallet_status', 'return.ship',
            'return.report', 'return.edit', 'return.delete', 'return.restore', 'return.export',
            'legacy.view', 'legacy.create', 'legacy.edit', 'legacy.photos']
        response = self.client.patch('/return/admin/departments', headers=self.admin, json={
            'name': 'Warehouse', 'permissions': actions, 'companies': companies})
        self.assertEqual(response.status_code, 200, response.json)

    def seed(self):
        for name in ['Acme', 'Private Co']:
            self.assertEqual(self.client.post('/return/admin/companies', headers=self.admin, json={'name': name}).status_code, 200)
        self.own = self.receive('Acme', 'OWN-SERIAL')
        self.other = self.receive('Private Co', 'PRIVATE-SERIAL')
        self.configure(['Acme'])

    def receive(self, company, serial):
        photo = io.BytesIO()
        Image.new('RGB', (2, 2), 'red').save(photo, format='PNG')
        photo.seek(0)
        response = self.client.post('/return/units', headers=self.admin, data={
            'payload': json.dumps({'company': company, 'tracking': 'SHARED-TRACK',
                'receivedDate': '2026-10-08', 'quantity': 1, 'units': [{'laptop': company + ' item', 'serial': serial, 'upc': '00123'}]}),
            'unitImages_0': (photo, 'photo.png')})
        self.assertEqual(response.status_code, 201, response.json)
        return response.json['ids'][0]

    def test_lists_details_reports_exports_and_direct_photos_are_scoped(self):
        self.seed()
        self.assertEqual(self.client.get('/return/companies', headers=self.staff).json['companies'], ['Acme'])
        result = self.client.get('/return/units', headers=self.staff).json
        self.assertEqual([row['id'] for row in result['items']], [self.own])
        self.assertNotIn('Private Co', json.dumps(result))
        self.assertEqual(self.client.get(f'/return/units/{self.other}', headers=self.staff).status_code, 404)
        for path in ['/return/admin/records', '/return/admin/records?q=Private', '/return/admin/export']:
            response = self.client.get(path, headers=self.staff)
            self.assertEqual(response.status_code, 200, response.json)
            self.assertNotIn('Private Co', response.get_data(as_text=True))
            self.assertNotIn('PRIVATE-SERIAL', response.get_data(as_text=True))
        self.assertEqual(self.client.get('/return/admin/records', headers=self.staff).json['total'], 1)
        self.assertEqual(self.client.get('/return/monthly-report', headers=self.staff).json['totals']['received'], 1)
        for record, expected in [(self.own, 200), (self.other, 404)]:
            detail = self.client.get(f'/return/units/{record}', headers=self.admin).json['item']
            url = detail['unitImages'][0]
            with self.client.get(url, headers=self.staff) as photo:
                self.assertEqual(photo.status_code, expected)
            folder = url.rsplit('/', 1)[0].replace('/images/', '/images/api/')
            self.assertEqual(self.client.get(folder, headers=self.staff).status_code, expected)

    def test_writes_classification_and_shipping_cannot_cross_companies(self):
        self.seed()
        bad = self.client.post('/return/units', headers=self.staff, data={'payload': json.dumps({
            'company': 'Private Co', 'receivedDate': '2026-10-08', 'tracking': 'TRACK', 'quantity': 1, 'units': [{'upc': 'A'}]})})
        self.assertEqual(bad.status_code, 403)
        self.assertEqual(self.client.patch(f'/return/admin/units/{self.own}', headers=self.staff, json={'company': 'Private Co'}).status_code, 403)
        self.assertEqual(self.client.patch(f'/return/admin/units/{self.other}', headers=self.staff, json={'laptop': 'HACK'}).status_code, 404)
        self.assertEqual(self.client.post(f'/return/units/{self.other}/inspection', headers=self.staff, json={'serial': 'X', 'inspectionDate': '2026-10-08'}).status_code, 404)
        classified = self.client.post(f'/return/units/{self.own}/bulk-type', headers=self.staff, json={'bulkType': 'BULK_NEW'})
        self.assertEqual(classified.status_code, 200, classified.json)
        self.assertEqual(classified.json['updatedIds'], [self.own])
        edited = self.client.patch(f'/return/admin/units/{self.own}', headers=self.staff, json={'laptop': 'Updated own item'})
        self.assertEqual(edited.status_code, 200, edited.json)
        self.assertEqual(self.client.get(f'/return/units/{self.other}', headers=self.admin).json['item']['bulkType'], 'REGULAR')
        bulk = self.client.post('/return/admin/bulk', headers=self.staff, json={'action': 'type', 'value': 'REGULAR', 'unitIds': [self.own]})
        self.assertEqual(bulk.json['updatedCount'], 1)
        blocked = self.client.post('/return/admin/bulk', headers=self.staff, json={'action': 'type', 'value': 'BULK_NEW', 'unitIds': [self.own, self.other]})
        self.assertEqual(blocked.status_code, 400)
        for record, serial in [(self.own, 'OWN-SERIAL'), (self.other, 'PRIVATE-SERIAL')]:
            self.assertEqual(self.client.post(f'/return/units/{record}/inspection', headers=self.admin, json={
                'serial': serial, 'inspectionDate': '2026-10-08', 'pallet': 'MIXED'}).status_code, 200)
        pallet = self.client.get('/return/pallets', headers=self.staff).json['pallets'][0]
        self.assertEqual((pallet['total'], pallet['ready']), (1, 1))
        self.assertEqual(self.client.post('/return/pallet-status', headers=self.staff, json={'pallet': 'MIXED', 'status': 'FULL'}).status_code, 403)
        shipped = self.client.post('/return/ship', headers=self.staff, json={'pallet': 'MIXED', 'shipDate': '2026-10-08'})
        self.assertEqual(shipped.status_code, 200, shipped.json)
        self.assertEqual(shipped.json['shipped'], [self.own])
        other = self.client.get(f'/return/units/{self.other}', headers=self.admin).json['item']
        self.assertIsNone(other['shipDate'])
        self.assertEqual(other['bulkType'], 'REGULAR')

    def test_scope_is_live_and_renames_preserve_grants_but_merges_revoke_them(self):
        self.seed()
        self.configure([])
        self.assertEqual(self.client.get('/return/units', headers=self.staff).json['items'], [])
        self.assertEqual(self.client.get('/return/companies', headers=self.staff).json['companies'], [])
        self.configure(['Acme'])
        self.assertEqual(self.client.patch('/return/admin/companies', headers=self.admin, json={'name': 'Acme', 'replacement': 'Renamed Co'}).status_code, 200)
        self.assertEqual(self.client.get('/return/companies', headers=self.staff).json['companies'], ['Renamed Co'])
        renamed = self.client.patch('/return/admin/departments', headers=self.admin, json={'name': 'Warehouse', 'newName': 'Customer Team', 'permissions': ['return.view']})
        self.assertEqual(renamed.status_code, 200, renamed.json)
        self.assertEqual(len(self.client.get('/return/units', headers=self.staff).json['items']), 1)
        self.assertEqual(self.client.delete('/return/admin/companies', headers=self.admin, json={'name': 'Renamed Co', 'replacement': 'Private Co'}).status_code, 200)
        self.assertEqual(self.client.get('/return/units', headers=self.staff).json['items'], [])
        self.assertLessEqual(len(company_key('x' * 255)), 100)

    def test_legacy_and_trash_do_not_expose_other_companies(self):
        self.seed()
        with self.app.app_context(), db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('UPDATE RMA_return_receiving SET legacyId = id, groupId = ? WHERE id = ?', 'legacy_own', self.own)
            cursor.execute('UPDATE RMA_return_receiving SET legacyId = id, groupId = ? WHERE id = ?', 'legacy_other', self.other)
        legacy = self.client.post('/return/', headers=self.staff, json={})
        self.assertEqual([row['id'] for row in legacy.json], [self.own])
        detail = self.client.get('/return/api/return/SHARED-TRACK', headers=self.staff)
        self.assertEqual(detail.json['Company'], 'Acme')
        self.assertEqual(self.client.post('/return/edit/SHARED-TRACK', headers=self.staff, data={'remark': 'BAD'}).status_code, 403)
        for record in [self.own, self.other]:
            self.assertEqual(self.client.delete(f'/return/admin/units/{record}', headers=self.admin, json={'confirmFileNo': f'sid-{record:04}'}).status_code, 200)
        trash = self.client.get('/return/admin/trash?pageSize=1', headers=self.staff).json
        self.assertEqual(trash['total'], 1)
        self.assertEqual(trash['items'][0]['snapshot']['company'], 'Acme')
        admin_trash = self.client.get('/return/admin/trash', headers=self.admin).json['items']
        other_event = next(item['id'] for item in admin_trash if item['snapshot']['company'] == 'Private Co')
        self.assertEqual(self.client.post(f'/return/admin/restore/{other_event}', headers=self.staff).status_code, 404)
        self.assertEqual(self.client.post('/return/admin/restore/' + str(trash['items'][0]['id']), headers=self.staff).status_code, 200)

    def test_department_and_unscoped_inventory_endpoints_do_not_disclose_customers(self):
        self.seed()
        self.assertEqual(self.client.get('/auth/api/departments').json['departments'], ['Pending assignment'])
        self.assertEqual(self.client.get('/auth/api/departments', headers=self.staff).json['departments'], ['Warehouse'])
        self.configure(['Acme'], ['return.view', 'pc.view', 'nonpc.view', 'xie.view', 'directory.view'])
        self.assertEqual(self.client.get('/auth/api/users', headers=self.staff).status_code, 403)
        registration = self.client.post('/auth/api/register', json={'username': 'customer-new', 'password': 'long-test-password', 'department': 'IT'})
        self.assertEqual(registration.status_code, 200, registration.json)
        users = self.client.get('/return/admin/users', headers=self.admin).json['users']
        self.assertEqual(next(u for u in users if u['username'] == 'customer-new')['department'], 'Pending assignment')
        self.assertEqual(self.client.post('/return/admin/users/approval', headers=self.admin, json={'username': 'customer-new', 'decision': 'approve'}).status_code, 400)


if __name__ == '__main__':
    unittest.main()
