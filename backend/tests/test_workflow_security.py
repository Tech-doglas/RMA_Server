import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[1]))
from app import create_app
from app.models import db_connection
from werkzeug.security import generate_password_hash


class WorkflowSecurityTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory(dir=Path(__file__).parent)
        self.addCleanup(self.folder.cleanup)
        self.app = create_app(dict(TESTING=True, DATABASE_BACKEND='sqlite',
                                   SQLITE_PATH=str(Path(self.folder.name) / 'db.sqlite3'), MODI_RMA_DIR=self.folder.name))
        self.app.logger.disabled = True
        self.client = self.app.test_client(use_cookies=False)
        with self.app.app_context(), db_connection() as conn:
            for name, role in [('admin', 'admin'), ('staff', 'normal')]:
                conn.cursor().execute('INSERT INTO RMA_users (username, password_hash, role, department) VALUES (?, ?, ?, ?)',
                                      name, generate_password_hash('initial-password'), role, 'Warehouse')
            conn.cursor().execute("INSERT INTO RMA_laptop_sheet (Brand, Stock, Spec) VALUES ('Dell', '', '8+256')")
            conn.cursor().execute("INSERT INTO RMA_non_laptop_sheet (TrackingNumber, Name) VALUES ('TRACK-1', 'Monitor')")
        self.admin = self.login('admin')
        self.staff = self.login('staff')

    def login(self, username):
        response = self.client.post('/auth/api/login', json=dict(username=username, password='initial-password'))
        self.assertEqual(response.status_code, 200, response.json)
        return {'Authorization': 'Bearer ' + response.json['token']}

    def allow(self, actions):
        response = self.client.patch('/return/admin/departments', headers=self.admin,
                                     json=dict(name='Warehouse', newName='Warehouse', permissions=actions))
        self.assertEqual(response.status_code, 200, response.json)

    def row(self, query, *params):
        with self.app.app_context(), db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(query, *params)
            return cursor.fetchone()

    def receive(self, tracking):
        response = self.client.post('/return/units', headers=self.admin, data={'payload': json.dumps({
            'receivedDate': '2026-09-30', 'tracking': tracking, 'units': [{}]})})
        self.assertEqual(response.status_code, 201, response.json)
        return response.json['ids'][0]

    def test_inventory_edit_cannot_bypass_sales_permission(self):
        self.allow(['pc.edit', 'nonpc.edit'])
        for field, value in [('stock', ''), ('order_number', 'NEW-ORDER'), ('updated_spec', '16+512')]:
            response = self.client.post('/laptop/item/update/1', headers=self.staff, data={field: value})
            self.assertEqual(response.status_code, 403, response.json)
        denied = self.client.post('/non_laptop/item/api/update/1', headers=self.staff,
                                  data={'trackingNumber': 'TRACK-1', 'orderNumber': 'NEW-ORDER'})
        self.assertEqual(denied.status_code, 403, denied.json)
        self.assertEqual(tuple(self.row('SELECT Stock, OrderNumber, UpDatedSpec FROM RMA_laptop_sheet WHERE ID = 1')), ('', None, None))
        self.assertIsNone(self.row('SELECT OrderNumber FROM RMA_non_laptop_sheet WHERE ID = 1')[0])
        edited = self.client.post('/laptop/item/update/1', headers=self.staff, data={'brand': 'HP', 'user': 'admin'})
        self.assertEqual(edited.status_code, 200, edited.data)
        self.assertEqual(tuple(self.row('SELECT Brand, LastModifiedUser, Stock FROM RMA_laptop_sheet WHERE ID = 1')), ('HP', 'staff', ''))

    def test_attribution_uses_signed_in_account_and_server_time(self):
        self.allow(['pc.create', 'nonpc.create', 'nonpc.edit', 'xie.create', 'xie.edit'])
        pc = self.client.post('/laptop/item/submit', headers=self.staff, data={'brand': 'Dell', 'user': 'admin'})
        self.assertEqual(pc.status_code, 200, pc.data)
        self.assertEqual(tuple(self.row('SELECT InputUser, LastModifiedUser FROM RMA_laptop_sheet WHERE ID = 2')), ('staff', 'staff'))
        nonpc = self.client.post('/non_laptop/item/submit', headers=self.staff,
                                 data={'tracking_number': 'NEW-TRACK', 'qty': '1', 'user': 'admin'})
        self.assertEqual(nonpc.status_code, 200, nonpc.data)
        self.assertEqual(self.row('SELECT LastModifiedUser FROM RMA_non_laptop_sheet WHERE ID = 2')[0], 'staff')
        changed = self.client.post('/non_laptop/item/api/update/1', headers=self.staff,
                                   data={'trackingNumber': 'TRACK-1', 'name': 'Updated', 'user': 'admin'})
        self.assertEqual(changed.status_code, 200, changed.json)
        self.assertEqual(self.row('SELECT LastModifiedUser FROM RMA_non_laptop_sheet WHERE ID = 1')[0], 'staff')
        inserted = self.client.post('/xie/api/xie-insert', headers=self.staff, json={'data': [{'user': 'admin', 'trackingNumber': 'X-1'}]})
        self.assertEqual(inserted.status_code, 200, inserted.json)
        updated = self.client.put('/xie/api/xie-update/1', headers=self.staff,
                                  json={'remark': 'Changed', 'last_modified_user': 'admin', 'last_modified_datetime': '2000-01-01'})
        self.assertEqual(updated.status_code, 200, updated.json)
        row = self.row('SELECT last_modified_user, last_modified_datetime, remark FROM xie_laptop_return WHERE id = 1')
        self.assertEqual(row[0], 'staff')
        self.assertNotEqual(str(row[1])[:10], '2000-01-01')
        self.assertEqual(row[2], 'Changed')

    def test_sales_success_is_json_and_retries_cannot_overwrite_orders(self):
        self.allow(['pc.sell', 'nonpc.sell'])
        for prefix, table in [('laptop', 'RMA_laptop_sheet'), ('non_laptop', 'RMA_non_laptop_sheet')]:
            saved = self.client.post(f'/{prefix}/sales/order', headers=self.staff, data={'id': '1', 'order': 'ORDER-1', 'ram': '8', 'ssd': '256'})
            self.assertEqual(saved.status_code, 200, saved.data)
            self.assertEqual(saved.json['message'], 'Sale saved.')
            repeated = self.client.post(f'/{prefix}/sales/order', headers=self.staff, data={'id': '1', 'order': 'ORDER-2'})
            self.assertEqual(repeated.status_code, 409, repeated.json)
            self.assertEqual(tuple(self.row(f'SELECT OrderNumber, LastModifiedUser FROM {table} WHERE ID = 1')), ('ORDER-1', 'staff'))
            self.assertEqual(self.client.post(f'/{prefix}/sales/order', headers=self.staff, data={'id': '999', 'order': 'ORDER-3'}).status_code, 404)

    def test_legacy_mutations_require_post_and_existing_records_require_edit(self):
        self.allow(['legacy.create'])
        data = {'tracking_number': 'LEGACY-1', 'company': 'Test', 'code': 'N', 'remark': 'Original'}
        self.assertEqual(self.client.post('/return/submit', headers=self.staff, data=data).status_code, 200)
        self.assertEqual(self.client.post('/return/submit', headers=self.staff, data=dict(data, remark='Unauthorized')).status_code, 403)
        self.assertEqual(self.client.get('/return/recorded/LEGACY-1', headers=self.admin).status_code, 405)
        self.assertEqual(self.client.get('/return/updateCode/LEGACY-1/A', headers=self.admin).status_code, 405)
        self.assertEqual(tuple(self.row('SELECT Recorded, Code, Remark FROM RMA_return_receiving WHERE TrackingNumber = ?', 'LEGACY-1')), (0, 'N', 'Original'))
        self.allow(['legacy.edit'])
        self.assertEqual(self.client.post('/return/recorded/LEGACY-1', headers=self.staff).status_code, 200)
        self.assertEqual(self.client.post('/return/updateCode/LEGACY-1/A', headers=self.staff).status_code, 200)

    def test_changing_tracking_cannot_reclassify_other_returns_without_permission(self):
        first, second = self.receive('TRACK-A'), self.receive('TRACK-B')
        self.assertEqual(self.client.post(f'/return/units/{second}/bulk-type', headers=self.admin, json={'bulkType': 'BULK_NEW'}).status_code, 200)
        self.allow(['return.edit'])
        denied = self.client.patch(f'/return/admin/units/{first}', headers=self.staff, json={'tracking': 'TRACK-B'})
        self.assertEqual(denied.status_code, 403, denied.json)
        self.assertEqual(self.row('SELECT tracking FROM RMA_return_units WHERE id = ?', first)[0], 'TRACK-A')
        self.assertEqual(self.row('SELECT bulkType FROM RMA_return_units WHERE id = ?', second)[0], 'BULK_NEW')

    def test_shipped_inspection_cannot_be_rewritten_while_shipment_is_active(self):
        item = self.receive('SHIP-1')
        self.assertEqual(self.client.post(f'/return/units/{item}/inspection', headers=self.admin,
                                          json=dict(inspectionDate='2026-09-30', serial='SERIAL-1', pallet='PALLET-1')).status_code, 200)
        self.assertEqual(self.client.post('/return/ship', headers=self.admin, json=dict(shipDate='2026-09-30', unitIds=[item])).status_code, 200)
        denied = self.client.patch(f'/return/admin/units/{item}', headers=self.admin, json={'pallet': 'PALLET-2'})
        self.assertEqual(denied.status_code, 400, denied.json)
        self.assertEqual(self.row('SELECT pallet FROM RMA_return_units WHERE id = ?', item)[0], 'PALLET-1')

    def test_receiving_quantity_rejects_invalid_or_excessive_values_without_writing(self):
        self.allow(['nonpc.create'])
        for quantity in ('0', '-1', '1001', '1.5', 'invalid', ''):
            response = self.client.post('/non_laptop/item/submit', headers=self.staff, data={'qty': quantity, 'tracking_number': 'BAD-QUANTITY'})
            self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(self.row('SELECT COUNT(*) FROM RMA_non_laptop_sheet')[0], 1)

    def test_unconfigured_xie_request_never_claims_success(self):
        self.allow(['xie.request'])
        response = self.client.post('/xie/api/request', headers=self.staff, json={'tracking': 'X-1'})
        self.assertEqual(response.status_code, 501)
        self.assertIn('not configured', response.json['error'])

    def test_order_export_preserves_formula_shaped_identifiers_as_text(self):
        from io import BytesIO
        from openpyxl import load_workbook
        order = '=HYPERLINK("https://example.invalid", "Order")'
        with self.app.app_context(), db_connection() as conn:
            conn.cursor().execute("UPDATE RMA_laptop_sheet SET Stock = 'SOLD', OrderNumber = ?, SaleDate = GETDATE() WHERE ID = 1", order)
        response = self.client.get('/report/laptop_ARP?format=excel', headers=self.admin)
        self.assertEqual(response.status_code, 200, response.data[:100])
        workbook = load_workbook(BytesIO(response.data))
        self.addCleanup(workbook.close)
        matching = [cell for row in workbook.active for cell in row if cell.value == order]
        self.assertEqual(len(matching), 1)
        self.assertEqual(matching[0].data_type, 's')

    def test_nonpc_bulk_actions_validate_ids_before_writing_and_record_actor(self):
        self.allow(['nonpc.request', 'nonpc.ready'])
        invalid_ids = [None, '1', [], [0], [-1], [True], [1.5], ['1 OR 1=1'], [1, 'invalid'], list(range(1, 1002))]
        for endpoint, column, expected in [('updaterequest', 'InspectionRequest', 'A'), ('saleready', 'ReadyToSale', 1)]:
            original = self.row(f'SELECT {column} FROM RMA_non_laptop_sheet WHERE ID = 1')[0]
            for ids in invalid_ids:
                response = self.client.post(f'/non_laptop/api/{endpoint}', headers=self.staff, json={'ids': ids})
                self.assertEqual(response.status_code, 400, response.data)
                self.assertEqual(self.row(f'SELECT {column} FROM RMA_non_laptop_sheet WHERE ID = 1')[0], original)
            result = self.client.post(f'/non_laptop/api/{endpoint}', headers=self.staff, json={'ids': [1, '1'], 'user': 'admin'})
            self.assertEqual(result.status_code, 200, result.json)
            saved = self.row(f'SELECT {column}, LastModifiedUser, LastModifiedDateTime FROM RMA_non_laptop_sheet WHERE ID = 1')
            self.assertEqual(saved[0], expected)
            self.assertEqual(saved[1], 'staff')
            self.assertIsNotNone(saved[2])
