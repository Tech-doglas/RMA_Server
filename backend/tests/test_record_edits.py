import io
import json
import unittest
from pathlib import Path
from PIL import Image
import test_receiving_admin as admin_tests
from app.models import db_connection


class RecordEditTests(unittest.TestCase):
    setUp = admin_tests.ReceivingAdminTests.setUp
    call = admin_tests.ReceivingAdminTests.call

    def detail(self, value):
        response = self.client.get(f'/return/units/{value}')
        self.assertEqual(response.status_code, 200, response.json)
        return response.json['item']

    def test_metadata_roundtrip_and_generated_ids_are_protected(self):
        patch = {'OrderNumber': ' ORDER-10 ', 'Code': ' PC ', 'Recorded': True,
                 'upc': ' 000123 ', 'itemInfo': 'Accessories', 'remark': 'New note', 'laptop': 'Keyboard'}
        result = self.call(f'/admin/units/{self.first}', 'PATCH', patch)
        self.assertEqual(result.status_code, 200, result.json)
        item = result.json['item']
        self.assertEqual((item['OrderNumber'], item['Code'], item['Recorded'], item['upc']), ('ORDER-10', 'PC', 1, '000123'))
        self.assertEqual(item['id'], self.first)
        for field in ['id', 'fileNo', 'groupId', 'unitIndex', 'quantityKnown', 'shipBatchNumber']:
            self.assertEqual(self.call(f'/admin/units/{self.first}', 'PATCH', {field: 500}).status_code, 400)
        for field in ['tracking', 'company', 'upc']:
            self.assertEqual(self.call(f'/admin/units/{self.first}', 'PATCH', {field: '  '}).status_code, 400)
        self.assertEqual(self.call(f'/admin/units/{self.first}', 'PATCH', {'Recorded': 'yes'}).status_code, 400)
        self.assertEqual(self.detail(self.first)['upc'], '000123')

    def test_quantity_increase_reduction_and_restore_preserve_ids(self):
        self.call(f'/admin/units/{self.first}', 'PATCH', {'serial': 'BASE-SERIAL', 'itemInfo': 'Keep accessories'})
        endpoint = f'/admin/units/{self.first}/quantity'
        result = self.call(endpoint, payload={'quantity': 3, 'expectedIds': [self.first, self.second]})
        self.assertEqual(result.status_code, 200, result.json)
        added = result.json['addedIds'][0]
        new = self.detail(added)
        self.assertEqual((new['upc'], new['itemInfo'], new['serial'], new['unitImages']), ('A', 'Keep accessories', '', []))
        self.assertIsNone(new['inspectionDate'])
        self.assertEqual(new['groupSize'], 3)
        self.assertEqual(self.call(endpoint, payload={'quantity': 4, 'expectedIds': [self.first, self.second]}).status_code, 400)
        result = self.call(endpoint, payload={'quantity': 2, 'expectedIds': [self.first, self.second, added], 'removeIds': [self.second]})
        self.assertEqual(result.status_code, 200, result.json)
        self.assertEqual(self.client.get(f'/return/units/{self.second}').status_code, 404)
        self.assertEqual((self.detail(self.first)['unitIndex'], self.detail(added)['unitIndex']), (1, 2))
        trash = self.client.get('/return/admin/trash').json['items'][0]
        restored = self.call('/admin/restore/' + str(trash['id']))
        self.assertEqual(restored.status_code, 200, restored.json)
        self.assertEqual(self.detail(self.second)['id'], self.second)
        self.assertEqual(self.detail(self.second)['unitIndex'], 3)

    def test_quantity_cannot_remove_current_or_inspected_units(self):
        endpoint = f'/admin/units/{self.first}/quantity'
        self.assertEqual(self.call(endpoint, payload={'quantity': 1, 'expectedIds': [self.first, self.second], 'removeIds': [self.first]}).status_code, 400)
        self.client.post(f'/return/units/{self.second}/inspection', json={'serial': 'INSPECTED', 'inspectionDate': '2026-10-01'})
        self.assertEqual(self.call(endpoint, payload={'quantity': 1, 'expectedIds': [self.first, self.second], 'removeIds': [self.second]}).status_code, 400)
        self.assertEqual(self.detail(self.first)['groupSize'], 2)

    def photo(self):
        image = io.BytesIO()
        Image.new('RGB', (2, 2), 'red').save(image, 'PNG'); image.seek(0)
        return image, 'photo.png'

    def test_photo_changes_are_per_record_validate_ownership_and_reject_stale_forms(self):
        endpoint = f'/return/admin/units/{self.first}/photos'
        result = self.client.post(endpoint, data={'field': 'images', 'expected': '[]', 'keep': '[]', 'images': self.photo()})
        self.assertEqual(result.status_code, 200, result.json)
        photos = result.json['photos']
        self.assertEqual(len(photos), 1)
        self.assertEqual(self.detail(self.second)['images'], [])
        self.assertEqual(self.client.post(endpoint, data={'field': 'images', 'expected': '[]', 'keep': '[]'}).status_code, 400)
        self.assertEqual(self.client.post(endpoint, data={'field': 'images', 'expected': json.dumps(photos), 'keep': json.dumps(['/images/another-company/private.jpg'])}).status_code, 400)
        removed = self.client.post(endpoint, data={'field': 'images', 'expected': json.dumps(photos), 'keep': '[]'})
        self.assertEqual(removed.status_code, 200, removed.json)
        self.assertEqual(self.detail(self.first)['images'], [])
        # Detaching a shared photo never deletes the underlying file.
        with self.client.get(photos[0]) as image:
            self.assertEqual(image.status_code, 200)

    def test_shipping_corrections_require_existing_batches_and_valid_dates(self):
        endpoint = f'/admin/units/{self.first}'
        self.assertEqual(self.call(endpoint, 'PATCH', {'serial': 'S1', 'inspectionDate': '2026-09-29'}).status_code, 400)
        self.assertEqual(self.call(endpoint, 'PATCH', {'serial': 'S1', 'inspectionDate': '2026-10-01', 'shipDate': '2026-10-02', 'shipBatch': 'ship.9999'}).status_code, 400)
        self.client.post(f'/return/units/{self.second}/inspection', json={'serial': 'S2', 'inspectionDate': '2026-10-01'})
        shipped = self.client.post('/return/ship', json={'unitIds': [self.second], 'shipDate': '2026-10-02'})
        self.assertEqual(shipped.status_code, 200, shipped.json)
        result = self.call(endpoint, 'PATCH', {'serial': 'S1', 'inspectionDate': '2026-10-01', 'shipDate': '2026-10-02', 'shipBatch': shipped.json['batchId']})
        self.assertEqual(result.status_code, 200, result.json)
        self.assertEqual(result.json['item']['shipBatchNumber'], self.detail(self.second)['shipBatchNumber'])
        self.assertEqual(self.call(endpoint, 'PATCH', {'pallet': 'P-OTHER'}).status_code, 400)
        cleared = self.call(endpoint, 'PATCH', {'shipDate': '', 'pallet': 'P-OTHER'})
        self.assertEqual(cleared.status_code, 200, cleared.json)
        self.assertEqual(cleared.json['item']['shipBatch'], '')
        self.assertIsNone(cleared.json['item']['shipBatchNumber'])

    def test_secondary_permissions_and_company_scope_are_enforced(self):
        with self.app.app_context(), db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("INSERT INTO RMA_departments (name) VALUES ('MetadataOnly')")
            for permission in ['return.view', 'return.edit', 'company.all']:
                cursor.execute('INSERT INTO RMA_department_permissions VALUES (?, ?)', 'MetadataOnly', permission)
            cursor.execute("UPDATE RMA_users SET department = 'MetadataOnly' WHERE username = 'staff-test'")
        token = self.client.post('/auth/api/login', json={'username': 'staff-test', 'password': 'initial-password'}).json['token']
        staff = {'Authorization': 'Bearer ' + token}
        endpoint = f'/admin/units/{self.first}'
        self.assertEqual(self.call(endpoint, 'PATCH', {'OrderNumber': 'ALLOWED'}, staff).status_code, 200)
        self.assertEqual(self.call(endpoint, 'PATCH', {'shipBatch': 'ship.9999', 'shipDate': '2026-10-02'}, staff).status_code, 403)
        self.assertEqual(self.call(endpoint + '/quantity', payload={'quantity': 3, 'expectedIds': [self.first, self.second]}, headers=staff).status_code, 403)
        self.assertEqual(self.call(endpoint + '/quantity', payload={'quantity': 1, 'expectedIds': [self.first, self.second], 'removeIds': [self.second]}, headers=staff).status_code, 403)
        self.assertEqual(self.client.post('/return' + endpoint + '/photos', headers=staff, data={'field': 'images', 'expected': '[]', 'keep': '[]'}).status_code, 403)

    def test_company_limited_editor_cannot_change_a_mixed_delivery_or_use_another_company_batch(self):
        from app.company_access import company_key
        self.call(f'/admin/units/{self.second}', 'PATCH', {'company': 'Private'})
        self.client.post(f'/return/units/{self.second}/inspection', json={'serial': 'PRIVATE', 'inspectionDate': '2026-10-01'})
        shipped = self.client.post('/return/ship', json={'unitIds': [self.second], 'shipDate': '2026-10-02'})
        self.assertEqual(shipped.status_code, 200)
        with self.app.app_context(), db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("INSERT INTO RMA_departments (name) VALUES ('ScopedEditor')")
            for permission in ['return.view', 'return.edit', 'return.receive', 'return.delete', 'return.ship', 'return.inspect', company_key('Acme')]:
                cursor.execute('INSERT INTO RMA_department_permissions VALUES (?, ?)', 'ScopedEditor', permission)
            cursor.execute("UPDATE RMA_users SET department = 'ScopedEditor' WHERE username = 'staff-test'")
        token = self.client.post('/auth/api/login', json={'username': 'staff-test', 'password': 'initial-password'}).json['token']
        staff = {'Authorization': 'Bearer ' + token}
        self.assertEqual(self.call(f'/admin/units/{self.first}/quantity', payload={'quantity': 3, 'expectedIds': [self.first]}, headers=staff).status_code, 403)
        result = self.call(f'/admin/units/{self.first}', 'PATCH', {'serial': 'OWN', 'inspectionDate': '2026-10-01', 'shipDate': '2026-10-02', 'shipBatch': shipped.json['batchId']}, staff)
        self.assertEqual(result.status_code, 400)
        self.assertIsNone(self.detail(self.first)['shipDate'])
        self.assertEqual(self.detail(self.first)['serial'], '')

    def test_corrected_historical_tracking_preserves_label_photos(self):
        with self.app.app_context(), db_connection() as conn:
            conn.cursor().execute("UPDATE RMA_return_receiving SET TrackingNumber = ?, groupId = ?, legacyId = ? WHERE id = ?", 'HIST-LABEL', 'legacy_' + str(self.first), self.first, self.first)
        folder = Path(self.folder.name) / 'images' / 'return_receiving' / 'HIST-LABEL'
        folder.mkdir(parents=True)
        Image.new('RGB', (2, 2), 'red').save(folder / 'label.png')
        original = self.detail(self.first)['images']
        self.assertEqual(len(original), 1)
        changed = self.call(f'/admin/units/{self.first}', 'PATCH', {'tracking': 'FIXED-LABEL'})
        self.assertEqual(changed.status_code, 200, changed.json)
        self.assertEqual(self.detail(self.first)['images'], original)

    def test_metadata_editor_can_keep_unchanged_inspection_and_shipping_dates(self):
        inspected = self.client.post(f'/return/units/{self.first}/inspection', json={'serial': 'SAVED-SERIAL', 'inspectionDate': '2026-10-01'})
        self.assertEqual(inspected.status_code, 200)
        self.assertEqual(self.client.post('/return/ship', json={'unitIds': [self.first], 'shipDate': '2026-10-02'}).status_code, 200)
        item = self.detail(self.first)
        with self.app.app_context(), db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("INSERT INTO RMA_departments (name) VALUES ('FieldsOnly')")
            for permission in ['return.view', 'return.edit', 'company.all']:
                cursor.execute('INSERT INTO RMA_department_permissions VALUES (?, ?)', 'FieldsOnly', permission)
            cursor.execute("UPDATE RMA_users SET department = 'FieldsOnly' WHERE username = 'staff-test'")
        token = self.client.post('/auth/api/login', json={'username': 'staff-test', 'password': 'initial-password'}).json['token']
        fields = ['tracking', 'company', 'upc', 'receivedDate', 'serial', 'inspectionDate', 'inspectionRemark', 'pallet', 'shipDate', 'shipBatch', 'bulkType']
        payload = {key: item[key] for key in fields}
        payload['OrderNumber'] = 'CORRECTED-ORDER'
        response = self.call(f'/admin/units/{self.first}', 'PATCH', payload, {'Authorization': 'Bearer ' + token})
        self.assertEqual(response.status_code, 200, response.json)
        self.assertEqual(response.json['item']['OrderNumber'], 'CORRECTED-ORDER')
        self.assertEqual(response.json['item']['shipBatch'], item['shipBatch'])
