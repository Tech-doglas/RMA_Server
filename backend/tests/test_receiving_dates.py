"""Date-order checks use real authenticated routes and isolated receiving storage."""
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[1]))
from app import create_app
from app.models import db_connection
from werkzeug.security import generate_password_hash


class ReceivingDateTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.password_hash = generate_password_hash('date-regression-password')

    def setUp(self):
        self.folder = tempfile.TemporaryDirectory(dir=Path(__file__).parent)
        self.addCleanup(self.folder.cleanup)
        self.app = create_app(dict(
            TESTING=True, DATABASE_BACKEND='sqlite', MODI_RMA_DIR=self.folder.name,
            SQLITE_PATH=str(Path(self.folder.name) / 'dates.sqlite3')))
        self.app.logger.disabled = True
        self.client = self.app.test_client()
        with self.app.app_context(), db_connection() as connection:
            connection.cursor().execute(
                'INSERT INTO RMA_users (username, password_hash, role, department) VALUES (?, ?, ?, ?)',
                'date-admin', self.password_hash, 'admin', 'IT')
        login = self.client.post('/auth/api/login', json={
            'username': 'date-admin', 'password': 'date-regression-password'})
        self.assertEqual(login.status_code, 200, login.json)
        received = self.client.post('/return/units', data={'payload': json.dumps({
            'tracking': 'DATE-ORDER', 'company': 'Acme', 'receivedDate': '2026-10-20',
            'quantity': 2, 'units': [{'upc': 'A'}, {'upc': 'B'}]})})
        self.assertEqual(received.status_code, 201, received.json)
        self.first, self.second = received.json['ids']

    def inspect(self, unit, day):
        return self.client.post(f'/return/units/{unit}/inspection', json={
            'inspectionDate': day, 'serial': f'DATE-SERIAL-{unit}', 'pallet': 'DATE-PALLET'})

    def stored_shipments(self):
        with self.app.app_context(), db_connection() as connection:
            cursor = connection.cursor()
            cursor.execute('SELECT shipDate, shipBatch, shipBatchNumber FROM RMA_return_receiving ORDER BY id')
            units = [tuple(row) for row in cursor.fetchall()]
            cursor.execute('SELECT batchNumber FROM RMA_return_shipping_batches')
            batches = [row[0] for row in cursor.fetchall()]
        return units, batches

    def test_inspection_before_receipt_does_not_change_existing_inspection(self):
        self.assertEqual(self.inspect(self.first, '2026-10-21').status_code, 200)
        response = self.inspect(self.first, '2026-10-19')
        self.assertEqual(response.status_code, 400, response.json)
        self.assertIn('before the received date', response.json['error'])
        saved = self.client.get(f'/return/units/{self.first}').json['item']
        self.assertEqual(saved['inspectionDate'], '2026-10-21')

    def test_receipt_inspection_and_shipping_can_share_the_same_day(self):
        self.assertEqual(self.inspect(self.first, '2026-10-20').status_code, 200)
        response = self.client.post('/return/ship', json={
            'unitIds': [self.first], 'shipDate': '2026-10-20'})
        self.assertEqual(response.status_code, 200, response.json)
        self.assertEqual(response.json['shipped'], [self.first])
        self.assertEqual(response.json['batchId'], 'ship.0001')

    def test_one_later_inspection_rejects_the_whole_selected_shipment(self):
        self.assertEqual(self.inspect(self.first, '2026-10-20').status_code, 200)
        self.assertEqual(self.inspect(self.second, '2026-10-22').status_code, 200)
        response = self.client.post('/return/ship', json={
            'unitIds': [self.first, self.second], 'shipDate': '2026-10-21'})
        self.assertEqual(response.status_code, 400, response.json)
        self.assertIn('before the inspection date', response.json['error'])
        self.assertEqual(self.stored_shipments(), ([(None, '', None), (None, '', None)], []))
        valid = self.client.post('/return/ship', json={
            'unitIds': [self.first, self.second], 'shipDate': '2026-10-22'})
        self.assertEqual(valid.status_code, 200, valid.json)
        self.assertEqual(valid.json['batchId'], 'ship.0001')
        self.assertCountEqual(valid.json['shipped'], [self.first, self.second])

    def test_pallet_shipment_checks_inspection_dates(self):
        self.assertEqual(self.inspect(self.first, '2026-10-22').status_code, 200)
        response = self.client.post('/return/ship', json={
            'pallet': 'DATE-PALLET', 'shipDate': '2026-10-21'})
        self.assertEqual(response.status_code, 400, response.json)
        self.assertEqual(self.stored_shipments(), ([(None, '', None), (None, '', None)], []))


if __name__ == '__main__':
    unittest.main()
