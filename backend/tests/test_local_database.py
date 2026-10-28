import base64
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[1]))
from app import create_app


class LocalDatabaseTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory(dir=Path(__file__).parent)
        self.addCleanup(self.folder.cleanup)
        self.config = {
            'TESTING': True, 'DATABASE_BACKEND': 'sqlite',
            'SQLITE_PATH': str(Path(self.folder.name) / 'rma.sqlite3'),
            'MODI_RMA_DIR': self.folder.name,
        }
        self.app = create_app(self.config)
        self.app.logger.disabled = True
        self.client = self.app.test_client(use_cookies=False)
        from app.models import db_connection
        from werkzeug.security import generate_password_hash
        with self.app.app_context(), db_connection() as conn:
            conn.cursor().execute('INSERT INTO RMA_users (username, password_hash, role, department) VALUES (?, ?, ?, ?)', 'test-admin', generate_password_hash('test-password'), 'admin', 'IT')
        token = self.client.post('/auth/api/login', json={'username': 'test-admin', 'password': 'test-password'}).json['token']
        self.client.environ_base['HTTP_AUTHORIZATION'] = 'Bearer ' + token

    def receive(self):
        png = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5f8AAAAASUVORK5CYII=')
        response = self.client.post('/return/units', data={
            'payload': json.dumps({'tracking': 'TRACK-LOCAL', 'receivedDate': '2026-09-30', 'company': 'Acme', 'quantity': 2,
                                   'units': [{'laptop': 'Dell', 'upc': 'A'}, {'laptop': 'Lenovo', 'upc': 'B'}]}),
            'images': (io.BytesIO(png), 'label.png'),
            'unitImages_0': (io.BytesIO(png), 'unit.png'),
        })
        self.assertEqual(response.status_code, 201, response.json)
        return response.json['ids']

    def test_multiple_unit_photos_append_only_to_selected_unit_and_enforce_limit(self):
        first, second = self.receive()
        old = self.client.get(f'/return/units/{first}').json['item']
        png = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5f8AAAAASUVORK5CYII=')
        response = self.client.post(f'/return/units/{first}/photos', data={
            'images': [(io.BytesIO(png), 'front.png'), (io.BytesIO(png), 'back.png')],
        })
        self.assertEqual(response.status_code, 200, response.json)
        photos = response.json['unitImages']
        self.assertEqual(len(photos), 3)
        self.assertEqual(photos[0], old['unitImages'][0])
        self.assertEqual(len(set(photos)), 3)
        for photo in photos:
            self.assertTrue((Path(self.folder.name) / photo.lstrip('/')).is_file())
        current = self.client.get(f'/return/units/{first}').json['item']
        self.assertEqual(current['unitImages'], photos)
        self.assertEqual(current['images'], old['images'])
        self.assertEqual(self.client.get(f'/return/units/{second}').json['item']['unitImages'], [])
        too_many = self.client.post(f'/return/units/{first}/photos', data={'images': [(io.BytesIO(png), f'{i}.png') for i in range(3)]})
        self.assertEqual(too_many.status_code, 400)
        self.assertEqual(self.client.get(f'/return/units/{first}').json['item']['unitImages'], photos)
        self.assertEqual(self.client.post(f'/return/units/{first}/photos', data={'images': (io.BytesIO(b'bad'), 'bad.png')}).status_code, 400)
        self.assertEqual(self.client.post(f'/return/units/{first}/photos').status_code, 400)
        self.assertEqual(self.client.post('/return/units/99999/photos', data={'images': (io.BytesIO(png), 'front.png')}).status_code, 404)

    def test_available_pallets_exclude_fully_shipped_and_count_remaining_units(self):
        first, second = self.receive()
        third, _ = self.receive()
        for unit_id, pallet in [(first, 'P-CLOSED'), (second, 'P-OPEN'), (third, 'P-OPEN')]:
            inspected = self.client.post(f'/return/units/{unit_id}/inspection', json={
                'inspectionDate': '2026-09-30', 'serial': f'PALLET-{unit_id}', 'pallet': pallet,
            })
            self.assertEqual(inspected.status_code, 200, inspected.json)
        before = self.client.get(f'/return/units/{third}').json['availablePallets']
        self.assertEqual(before, [{'pallet': 'P-CLOSED', 'total': 1, 'status': 'OPEN'}, {'pallet': 'P-OPEN', 'total': 2, 'status': 'OPEN'}])
        shipped = self.client.post('/return/ship', json={'shipDate': '2026-09-30', 'unitIds': [first, second]})
        self.assertEqual(shipped.status_code, 200, shipped.json)
        after = self.client.get(f'/return/units/{third}').json['availablePallets']
        self.assertEqual(after, [{'pallet': 'P-OPEN', 'total': 1, 'status': 'OPEN'}])

    def test_locked_and_full_pallets_block_new_assignments_but_allow_inspection_and_shipping(self):
        first, second = self.receive()
        inspection = {'inspectionDate': '2026-09-30', 'serial': 'PALLET-FIRST', 'pallet': 'P1'}
        self.assertEqual(self.client.post(f'/return/units/{first}/inspection', json=inspection).status_code, 200)
        for status in ['LOCKED', 'FULL']:
            changed = self.client.post('/return/pallet-status', json={'pallet': 'P1', 'status': status})
            self.assertEqual(changed.status_code, 200, changed.json)
            self.assertEqual(self.client.get('/return/pallets').json['pallets'][0]['status'], status)
            blocked = self.client.post(f'/return/units/{second}/inspection', json=dict(inspection, serial='PALLET-SECOND', pallet='p1'))
            self.assertEqual(blocked.status_code, 400, blocked.json)
            self.assertEqual(self.client.get(f'/return/units/{second}').json['item']['pallet'], '')
            self.assertEqual(self.client.post(f'/return/units/{first}/inspection', json=dict(inspection, inspectionRemark='Existing unit')).status_code, 200)
        restarted = create_app(self.config).test_client(use_cookies=False)
        restarted.environ_base['HTTP_AUTHORIZATION'] = self.client.environ_base['HTTP_AUTHORIZATION']
        self.assertEqual(restarted.get(f'/return/units/{second}').json['availablePallets'][0]['status'], 'FULL')
        shipped = self.client.post('/return/ship', json={'shipDate': '2026-09-30', 'unitIds': [first]})
        self.assertEqual(shipped.status_code, 200, shipped.json)
        self.assertEqual(self.client.post('/return/pallet-status', json={'pallet': 'P1', 'status': 'OPEN'}).status_code, 200)
        self.assertEqual(self.client.post(f'/return/units/{second}/inspection', json=dict(inspection, serial='PALLET-SECOND')).status_code, 200)
        self.assertEqual(self.client.post('/return/pallet-status', json={'pallet': 'P1', 'status': 'INVALID'}).status_code, 400)
        self.assertEqual(self.client.post('/return/pallet-status', json={'pallet': 'missing', 'status': 'FULL'}).status_code, 404)

    def test_registration_login_duplicate_and_password_hash(self):
        account = dict(username='local-test', password='test-password', department='Tech')
        self.assertEqual(self.client.post('/auth/api/register', json=account).status_code, 200)
        self.assertEqual(self.client.post('/auth/api/register', json=account).status_code, 409)
        result = self.client.post('/auth/api/login', json=account)
        self.assertEqual(result.status_code, 403)
        self.assertIn('admin approval', result.json['error'])
        self.assertNotIn('token', result.json)
        self.assertEqual(self.client.post('/auth/api/login', json=dict(account, password='wrong')).status_code, 401)
        with self.app.app_context():
            from app.models import db_connection
            with db_connection() as connection:
                cursor = connection.cursor()
                cursor.execute('SELECT password_hash FROM RMA_users WHERE username = ?', 'local-test')
                self.assertNotEqual(cursor.fetchone()[0], account['password'])

    def test_complete_receiving_inspection_shipping_and_report(self):
        first, second = self.receive()
        item = self.client.get('/return/units/sid-0001').json['item']
        self.assertEqual(item['groupSize'], 2)
        self.assertEqual(item['siblings'][0]['id'], second)
        self.assertEqual(len(item['images']), 1)
        self.assertEqual(len(item['unitImages']), 1)
        photo = self.client.get(item['images'][0])
        self.assertEqual(photo.status_code, 200)
        photo.close()
        inspection = dict(inspectionDate='2026-09-30', serial='SERIAL-LOCAL', pallet='P1')
        self.assertEqual(self.client.post(f'/return/units/{first}/inspection', json=inspection).status_code, 200)
        duplicate = self.client.post(f'/return/units/{second}/inspection', json=dict(inspection, serial='serial-local'))
        self.assertEqual(duplicate.status_code, 400)
        bulk = self.client.post(f'/return/units/{first}/bulk-type', json={'bulkType': 'BULK_NEW'})
        self.assertEqual(bulk.status_code, 200)
        self.assertEqual(bulk.json['updatedCount'], 2)
        summary = self.client.get('/return/pallets').json['pallets']
        self.assertEqual(summary, [dict(pallet='P1', ready=1, shipped=0, total=1, status='OPEN')])
        shipment = self.client.post('/return/ship', json=dict(shipDate='2026-09-30', unitIds=[first, second]))
        self.assertEqual(shipment.status_code, 200, shipment.json)
        self.assertEqual(shipment.json['batchId'], 'ship.0001')
        self.assertEqual(shipment.json['shipped'], [first])
        self.assertEqual(shipment.json['skipped'], [dict(id=second, reason='not inspected')])
        self.assertEqual(self.client.get('/return/monthly-report').json['totals'], dict(received=2, inspected=1, shipped=1))
        self.assertEqual(len(self.client.get('/return/units').json['items']), 2)
        self.assertEqual(self.client.post(f'/return/units/{second}/inspection', json=dict(inspection, serial='SECOND-SERIAL')).status_code, 200)
        next_shipment = self.client.post('/return/ship', json=dict(shipDate='2026-09-30', pallet='P1'))
        self.assertEqual(next_shipment.json['batchId'], 'ship.0002')
        self.assertEqual(next_shipment.json['shipped'], [second])

    def test_data_persists_after_app_restart_and_initialization(self):
        self.receive()
        restarted = create_app(self.config).test_client(use_cookies=False)
        restarted.environ_base['HTTP_AUTHORIZATION'] = self.client.environ_base['HTTP_AUTHORIZATION']
        items = restarted.get('/return/units').json['items']
        self.assertEqual(len(items), 2)
        self.assertEqual(items[0]['fileNo'], 'sid-0002')

    def test_old_bulk_types_migrate_and_tracking_updates_existing_units(self):
        first, second = self.receive()
        self.assertEqual(self.client.get(f'/return/units/{first}').json['item']['bulkType'], 'REGULAR')
        with self.app.app_context():
            from app.models import db_connection
            with db_connection() as connection:
                cursor = connection.cursor()
                cursor.execute('UPDATE RMA_return_receiving SET bulkType = ? WHERE id = ?', 'BULK_USED', first)
                cursor.execute('UPDATE RMA_return_receiving SET bulkType = ? WHERE id = ?', ' bulk_new ', second)
        restarted = create_app(self.config).test_client(use_cookies=False)
        restarted.environ_base['HTTP_AUTHORIZATION'] = self.client.environ_base['HTTP_AUTHORIZATION']
        self.assertEqual(restarted.get(f'/return/units/{first}').json['item']['bulkType'], 'BULK_USED')
        self.assertEqual(restarted.get(f'/return/units/{second}').json['item']['bulkType'], 'BULK_NEW')
        rejected = restarted.post(f'/return/units/{first}/bulk-type', json={'bulkType': 'UNREGISTERED'})
        self.assertEqual(rejected.status_code, 400)
        updated = restarted.post(f'/return/units/{first}/bulk-type', json={'bulkType': 'regular'})
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.json['updatedCount'], 2)
        for unit_id in [first, second]:
            self.assertEqual(restarted.get(f'/return/units/{unit_id}').json['item']['bulkType'], 'REGULAR')

    def test_empty_legacy_inventory_and_snowbell_lists_load(self):
        for endpoint, payload in [('/return/', {}), ('/laptop/api/laptops/search', {}),
                                  ('/non_laptop/api/search', {}), ('/xie/api/search', {})]:
            response = self.client.post(endpoint, json=payload)
            self.assertEqual(response.status_code, 200, endpoint)
            self.assertEqual(response.json, [])

    def test_local_inventory_inserts_and_number_generation(self):
        laptop = self.client.post('/laptop/item/submit', data=dict(brand='Dell', model='Local test', ram='8', ssd='256', serial_number='LOCAL-PC'))
        self.assertEqual(laptop.status_code, 200)
        self.assertEqual(laptop.data, b'OK')
        self.assertEqual(self.client.get('/laptop/item/1').json['SerialNumber'], 'LOCAL-PC')
        nonpc = self.client.post('/non_laptop/item/submit', data=dict(tracking_number='No Tracking - 00001', category='Mouse', name='Local test', received_date='2026-09-30', qty='2'))
        self.assertEqual(nonpc.data, b'OK')
        self.assertEqual(len(self.client.post('/non_laptop/api/search', json={}).json), 2)
        self.assertEqual(self.client.get('/non_laptop/api/get_tracking_number').json, 1)
        snowbell = self.client.post('/xie/api/xie-insert', json={'data': [{'trackingNumber': 'LOCAL-XIE', 'returnId': 'sid00001'}]})
        self.assertEqual(snowbell.status_code, 200, snowbell.json)
        self.assertEqual(len(self.client.post('/xie/api/search', json={}).json), 1)


if __name__ == '__main__':
    unittest.main()
