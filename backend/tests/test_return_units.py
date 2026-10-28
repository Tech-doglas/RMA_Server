"""Receiving route tests with a fake SQL connection; no live database writes."""
import importlib.util
import io
import json
import sys
import types
import unittest
from contextlib import contextmanager
from datetime import date
from pathlib import Path
from unittest.mock import MagicMock, patch

from flask import Flask, g

sys.path.insert(0, str(Path(__file__).parents[1]))

# Load this blueprint without starting the production app or requiring ODBC.
models = types.ModuleType('app.models')
models.db_connection = MagicMock()
models.get_modi_rma_root = MagicMock()
spec = importlib.util.spec_from_file_location('return_units_test', Path(__file__).parents[1] / 'app/routes/return_units.py')
routes = importlib.util.module_from_spec(spec)
with patch.dict(sys.modules, {'app.models': models}):
    spec.loader.exec_module(routes)


class ReceivingTests(unittest.TestCase):
    def setUp(self):
        self.app = Flask(__name__)
        @self.app.before_request
        def authorized_test_account():
            g.session_account = dict(role='admin', permissions=[])
        self.app.register_blueprint(routes.return_units_bp, url_prefix='/return')
        self.client = self.app.test_client()
        self.cursor = MagicMock()
        self.conn = MagicMock()
        self.conn.cursor.return_value = self.cursor
        self.committed = False
        self.rolled_back = False

        @contextmanager
        def connection():
            try:
                yield self.conn
                self.committed = True
            except Exception:
                self.rolled_back = True
                raise

        self.patcher = patch.object(routes, 'db_connection', connection)
        self.patcher.start()
        self.addCleanup(self.patcher.stop)

    def unit(self, **overrides):
        return dict(id=1, tracking='TRACK-1', groupId='group', shipDate=None, inspectionDate=None, **overrides)

    def test_receiving_creates_individual_units_and_shared_group(self):
        self.cursor.fetchone.side_effect = [(7,), (8,)]
        response = self.client.post('/return/units', data={'payload': json.dumps({
            'tracking': ' TRACK-1 ', 'receivedDate': '2026-09-30', 'company': 'Acme', 'quantity': 2,
            'units': [{'laptop': 'Dell', 'upc': '00123'}, {'laptop': 'Lenovo', 'upc': '00123'}],
        })})
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json['fileNos'], ['sid-0007', 'sid-0008'])
        calls = self.cursor.execute.call_args_list
        self.assertEqual(calls[0].args[1], 'TRACK-1')
        self.assertEqual(calls[0].args[6], calls[1].args[6])
        self.assertEqual([call.args[7] for call in calls], [1, 2])
        self.assertTrue(self.committed)

    def test_required_receiving_fields_reject_missing_blank_or_invalid_values_before_writes(self):
        valid = {'tracking': 'TRACK', 'receivedDate': '2026-10-26', 'company': 'Acme',
                 'quantity': 2, 'units': [{'upc': '00123'}, {'upc': '00123'}]}
        for field in ('tracking', 'receivedDate', 'company', 'quantity'):
            for value in (None, '', '   ', [], False):
                with self.subTest(field=field, value=value):
                    payload = {**valid, field: value}
                    if value is None:
                        del payload[field]
                    response = self.client.post('/return/units', data={'payload': json.dumps(payload)})
                    self.assertEqual(response.status_code, 400, response.json)
        for quantity in (0, 1, 2.0, 101):
            response = self.client.post('/return/units', data={'payload': json.dumps({**valid, 'quantity': quantity})})
            self.assertEqual(response.status_code, 400, response.json)
        for value in (None, '', '   ', 123, False, {}):
            payload = {**valid, 'units': [{'upc': '00123'}, {'upc': value}]}
            if value is None:
                payload['units'][1] = {}
            response = self.client.post('/return/units', data={'payload': json.dumps(payload)})
            self.assertEqual(response.status_code, 400)
            self.assertIn('UPC/Item code for item 2', response.json['error'])
        self.cursor.execute.assert_not_called()

    def test_invalid_receiving_does_not_write(self):
        valid = {'tracking': 'TRACK', 'company': 'Acme', 'quantity': 1,
                 'receivedDate': '2026-09-30', 'units': [{'upc': 'A'}]}
        for payload in [{'units': []}, {'units': [{'laptop': 'Dell'}], 'receivedDate': '2026-02-30'}, {'units': ['bad'], 'receivedDate': '2026-09-30'}, {'quantity': 2, 'units': [{}], 'receivedDate': '2026-09-30'}]:
            response = self.client.post('/return/units', data={'payload': json.dumps({**valid, **payload})})
            self.assertEqual(response.status_code, 400)
        self.cursor.execute.assert_not_called()

    def test_failed_unit_insert_rolls_back_whole_delivery(self):
        self.cursor.fetchone.side_effect = [(1,)]
        self.cursor.execute.side_effect = [None, RuntimeError('Database failure')]
        with patch.object(routes, 'get_modi_rma_root', return_value=str(Path(__file__).parent)), patch.object(routes, 'save_images', return_value=[]):
            response = self.client.post('/return/units', data={'payload': json.dumps({
                'receivedDate': '2026-09-30', 'tracking': 'TRACK', 'company': 'Acme', 'quantity': 2,
                'units': [{'upc': 'A'}, {'upc': 'B'}],
            })})
        self.assertEqual(response.status_code, 500)
        self.assertTrue(self.rolled_back)
        self.assertFalse(self.committed)

    def test_rejects_nonimage_upload(self):
        response = self.client.post('/return/units', data={
            'payload': json.dumps({'receivedDate': '2026-09-30', 'tracking': 'TRACK', 'company': 'Acme', 'quantity': 1, 'units': [{'upc': 'A'}]}),
            'images': (io.BytesIO(b'not an image'), 'fake.jpg'),
        })
        self.assertEqual(response.status_code, 400)
        self.cursor.execute.assert_not_called()

    def test_file_number_lookup_and_photos(self):
        self.cursor.description = [('id',), ('images',), ('unitImages',)]
        self.cursor.fetchall.return_value = [(42, '["/images/label.jpg"]', '[]')]
        with self.app.test_request_context():
            g.session_account = dict(role='admin', permissions=[])
            item = routes.get_unit(self.cursor, 'SID-0042')
        self.assertEqual(self.cursor.execute.call_args.args[1], 42)
        self.assertEqual(item['fileNo'], 'sid-0042')
        self.assertEqual(item['images'], ['/images/label.jpg'])

    def test_duplicate_serial_rolls_back(self):
        self.cursor.fetchone.return_value = (2,)
        with patch.object(routes, 'get_unit', return_value=self.unit()):
            response = self.client.post('/return/units/1/inspection', json={'inspectionDate': '2026-09-30', 'serial': ' DUPLICATE '})
        self.assertEqual(response.status_code, 400)
        self.assertTrue(self.rolled_back)
        self.assertFalse(self.committed)
        self.assertEqual(self.cursor.execute.call_args.args[1], 'duplicate')

    def test_inspection_requires_serial_and_date(self):
        for payload in [{'serial': 'ABC'}, {'inspectionDate': '2026-09-30', 'serial': '   '}]:
            self.assertEqual(self.client.post('/return/units/1/inspection', json=payload).status_code, 400)
        self.cursor.execute.assert_not_called()

    def test_bulk_type_applies_to_tracking_or_single_blank_tracking(self):
        for tracking, expected_field, expected_target in [('TRACK-1', 'TrackingNumber', 'TRACK-1'), ('', 'id', 1)]:
            self.cursor.fetchall.return_value = [(1,), (2,)]
            with patch.object(routes, 'get_unit', return_value=dict(id=1, tracking=tracking)):
                response = self.client.post('/return/units/1/bulk-type', json={'bulkType': 'BULK_NEW'})
            self.assertEqual(response.status_code, 200)
            self.assertIn('WHERE ' + expected_field + ' = ?', self.cursor.execute.call_args.args[0])
            self.assertEqual(self.cursor.execute.call_args.args[2], expected_target)

    def test_ship_skips_uninspected_shipped_and_missing_units(self):
        self.cursor.fetchone.return_value = (4,)
        candidates = [dict(id=1, inspectionDate=date(2026, 9, 1), shipDate=None),
                      dict(id=2, inspectionDate=None, shipDate=None),
                      dict(id=3, inspectionDate=date(2026, 9, 1), shipDate=date(2026, 9, 2))]
        with patch.object(routes, 'rows', return_value=candidates):
            response = self.client.post('/return/ship', json={'shipDate': '2026-09-30', 'unitIds': [1, 2, 3, 99]})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json['batchId'], 'ship.0005')
        self.assertEqual(response.json['shipped'], [1])
        self.assertEqual({row['reason'] for row in response.json['skipped']}, {'not found', 'not inspected', 'already shipped'})
        self.assertTrue(self.committed)

    def test_nothing_eligible_to_ship_does_not_update(self):
        self.cursor.fetchone.return_value = (0,)
        with patch.object(routes, 'rows', return_value=[dict(id=1, inspectionDate=None, shipDate=None)]):
            response = self.client.post('/return/ship', json={'shipDate': '2026-09-30', 'pallet': 'P1'})
        self.assertEqual(response.status_code, 400)
        self.assertFalse(any('UPDATE' in call.args[0] for call in self.cursor.execute.call_args_list))

    def test_monthly_report_counts_each_stage_in_its_own_month(self):
        self.cursor.fetchall.return_value = [
            (date(2026, 8, 31), date(2026, 9, 1), date(2026, 9, 2)),
            (date(2026, 9, 1), None, None),
        ]
        response = self.client.get('/return/monthly-report')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json['months'][0], dict(month='2026-09', received=1, inspected=1, shipped=1))
        self.assertEqual(response.json['totals'], dict(received=2, inspected=1, shipped=1))


if __name__ == '__main__':
    unittest.main()
