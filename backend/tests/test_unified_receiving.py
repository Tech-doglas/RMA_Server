import json
import sqlite3
import sys
import tempfile
import unittest
from contextlib import closing
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[1]))
from app import create_app
from app.local_database import initialize_local_database
from werkzeug.security import generate_password_hash

LEGACY_SCHEMA = '''CREATE TABLE RMA_return_receiving (
    id INTEGER PRIMARY KEY AUTOINCREMENT, TrackingNumber TEXT NOT NULL UNIQUE,
    Company TEXT NOT NULL, Code TEXT NOT NULL, Remark TEXT NOT NULL,
    CreationDateTime DATETIME NOT NULL, OrderNumber TEXT NOT NULL, Recorded INTEGER NOT NULL);
INSERT INTO RMA_return_receiving VALUES (7,'OLD-TRACK','Historical company','PC','Original note',
    '2026-09-24 10:20:30','ORDER-7',1);'''


class UnifiedReceivingTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory(dir=Path(__file__).parent)
        self.addCleanup(self.folder.cleanup)
        self.path = Path(self.folder.name) / 'rma.sqlite3'
        with closing(sqlite3.connect(self.path)) as db, db:
            db.executescript(LEGACY_SCHEMA)

    def start(self):
        self.app = create_app(dict(TESTING=True, DATABASE_BACKEND='sqlite', SQLITE_PATH=str(self.path), MODI_RMA_DIR=self.folder.name))
        self.app.logger.disabled = True
        with closing(sqlite3.connect(self.path)) as db, db:
            db.execute('INSERT INTO RMA_users (username,password_hash,role,department) VALUES (?,?,?,?)',
                       ('migration-admin', generate_password_hash('test-migration-password'), 'admin', 'IT'))
        self.client = self.app.test_client()
        self.assertEqual(self.client.post('/auth/api/login', json={'username':'migration-admin','password':'test-migration-password'}).status_code, 200)
        return self.client.get('/return/units').json['items']

    def test_existing_table_is_upgraded_in_place_and_restart_does_not_duplicate(self):
        items = self.start()
        self.assertEqual(len(items), 1)
        item = self.client.get('/return/units/' + items[0]['fileNo']).json['item']
        self.assertEqual((item['tracking'],item['company'],item['Code'],item['OrderNumber'],item['Recorded'],item['remark']),
                         ('OLD-TRACK','Historical company','PC','ORDER-7',1,'Original note'))
        self.assertEqual(item['receivedDate'], '2026-09-24')
        self.assertEqual(item['legacyId'], 7)
        self.assertEqual(item['quantityKnown'], 0)
        self.assertIsNone(item['inspectionDate'])
        self.assertIsNone(item['shipDate'])
        initialize_local_database(str(self.path))
        with closing(sqlite3.connect(self.path)) as db, db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM RMA_return_receiving').fetchone()[0], 1)
            self.assertIsNone(db.execute("SELECT 1 FROM sqlite_master WHERE name='RMA_return_units'").fetchone())
            self.assertEqual(db.execute('PRAGMA integrity_check').fetchone()[0], 'ok')
        backup = next((Path(self.folder.name)/'backups').glob('before-unified-receiving-*'))
        with closing(sqlite3.connect(backup)) as db:
            self.assertEqual(db.execute('SELECT id FROM RMA_return_receiving').fetchone()[0],7)

    def test_blank_groups_do_not_join_unrelated_receipts(self):
        self.start()
        with closing(sqlite3.connect(self.path)) as db, db:
            for tracking, group in [('LATE-OLD-1', ''), ('LATE-OLD-2', ''), ('SPACE-1', ' '), ('SPACE-2', ' ')]:
                db.execute('INSERT INTO RMA_return_receiving (TrackingNumber, groupId) VALUES (?, ?)', (tracking, group))
        created = self.client.post('/return/units', data={'payload': json.dumps({
            'receivedDate': '2026-10-16', 'tracking': 'CURRENT', 'company': 'Acme', 'quantity': 2, 'units': [{'upc': 'A'}, {'upc': 'B'}]})})
        self.assertEqual(created.status_code, 201, created.json)
        for item in self.client.get('/return/units').json['items']:
            detail = self.client.get('/return/units/' + item['fileNo']).json['item']
            expected = 2 if item['tracking'] == 'CURRENT' else 1
            self.assertEqual(item['groupSize'], expected)
            self.assertEqual(detail['groupSize'], expected)
            self.assertEqual(len(detail['siblings']), expected - 1)

    def test_upc_survives_receive_edit_export_remove_restore(self):
        self.start()
        response = self.client.post('/return/units', data={'payload': json.dumps({
            'receivedDate': '2026-10-16', 'tracking': 'TRACK', 'company': 'Acme', 'quantity': 3, 'units': [
                {'laptop': 'Keyboard', 'upc': ' 001234567890 ', 'itemName': 'Wireless keyboard', 'itemInfo': 'Black; USB receiver included'},
                {'laptop': 'Keyboard', 'upc': '001234567890'},
                {'laptop': 'Unknown item', 'upc': 'CODE-3'},
            ]})})
        self.assertEqual(response.status_code, 201, response.json)
        ids = response.json['ids']
        for unit_id, expected in zip(ids, ['001234567890', '001234567890', 'CODE-3']):
            self.assertEqual(self.client.get(f'/return/units/{unit_id}').json['item']['upc'], expected)
        original = self.client.get(f'/return/units/{ids[0]}').json['item']
        self.assertEqual((original['laptop'], original['itemName'], original['itemInfo']),
                         ('Keyboard', 'Wireless keyboard', 'Black; USB receiver included'))
        blank = self.client.get(f'/return/units/{ids[2]}').json['item']
        self.assertEqual((blank['itemName'], blank['itemInfo']), ('', ''))
        edited = self.client.patch(f'/return/admin/units/{ids[0]}', json={'upc': '000111222333', 'itemName': 'Compact keyboard', 'itemInfo': 'Tested; box included'})
        self.assertEqual(edited.status_code, 200, edited.json)
        exported = self.client.get('/return/admin/export').json['units']
        self.assertEqual(next(item for item in exported if item['id'] == ids[0])['upc'], '000111222333')
        self.assertEqual(next(item for item in exported if item['id'] == ids[0])['itemInfo'], 'Tested; box included')
        removed = self.client.delete(f'/return/admin/units/{ids[0]}', json={'confirmFileNo': response.json['fileNos'][0]})
        self.assertEqual(removed.status_code, 200, removed.json)
        with closing(sqlite3.connect(self.path)) as db:
            event_id = db.execute("SELECT MAX(id) FROM RMA_return_admin_audit WHERE action='remove unit'").fetchone()[0]
        restored = self.client.post(f'/return/admin/restore/{event_id}')
        self.assertEqual(restored.status_code, 200, restored.json)
        self.assertEqual(self.client.get(f'/return/units/{ids[0]}').json['item']['upc'], '000111222333')
        restored_item = self.client.get(f'/return/units/{ids[0]}').json['item']
        self.assertEqual((restored_item['laptop'], restored_item['itemName'], restored_item['itemInfo']),
                         ('Keyboard', 'Compact keyboard', 'Tested; box included'))
        for field, length in [('itemName', 256), ('itemInfo', 4001)]:
            invalid = self.client.post('/return/units', data={'payload': json.dumps({
                'receivedDate': '2026-10-16', 'tracking': 'TRACK', 'company': 'Acme', 'quantity': 1, 'units': [{'upc': 'A', field: 'X' * length}],
            })})
            self.assertEqual(invalid.status_code, 400)
        rejected = self.client.post('/return/units', data={'payload': json.dumps({
            'receivedDate': '2026-10-16', 'tracking': 'TRACK', 'company': 'Acme', 'quantity': 1, 'units': [{'upc': '1' * 256}],
        })})
        self.assertEqual(rejected.status_code, 400)

    def test_existing_unit_schema_adds_upc_once_without_changing_records(self):
        from app.receiving_store import receiving_schema, upgrade_receiving
        with closing(sqlite3.connect(':memory:')) as db:
            schema = receiving_schema()
            for field in ('upc', 'itemName', 'itemInfo'):
                schema = schema.replace(f"{field} TEXT NOT NULL DEFAULT '', ", '')
            db.execute(schema)
            db.execute("INSERT INTO RMA_return_receiving (id, laptop, serial) VALUES (42, 'Keyboard', 'SERIAL42')")
            db.commit()
            upgrade_receiving(db, self.path)
            upgrade_receiving(db, self.path)
            self.assertEqual(db.execute('SELECT id, laptop, serial, upc, itemName, itemInfo FROM RMA_return_receiving').fetchall(),
                             [(42, 'Keyboard', 'SERIAL42', '', '', '')])

    def test_current_printed_ids_and_deleted_id_reservations_survive(self):
        with closing(sqlite3.connect(self.path)) as db, db:
            db.executescript('''CREATE TABLE RMA_return_units (
              id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp DATETIME, tracking TEXT, company TEXT,
              laptop TEXT, receivedDate DATE, remark TEXT, groupId TEXT, unitIndex INTEGER,
              images TEXT, unitImages TEXT, serial TEXT, serialKey TEXT, inspectionDate DATE,
              pallet TEXT, inspectionRemark TEXT, shipDate DATE, shipBatch TEXT, shipBatchNumber INTEGER, bulkType TEXT);
              INSERT INTO RMA_return_units VALUES (42,'2026-09-30 11:00:00','NEW','Company','Dell','2026-09-30',
                'Saved note','group-42',1,'["/saved-label.png"]','["/saved-unit.png"]','SERIAL42','serial42',
                '2026-09-30','PALLET42','Passed',NULL,'',NULL,'REGULAR');
              INSERT INTO RMA_return_units (id) VALUES (50);
              DELETE FROM RMA_return_units WHERE id=50;''')
        items = self.start()
        self.assertEqual({i['id'] for i in items}, {42,51})
        current = self.client.get('/return/units/sid-0042').json['item']
        self.assertEqual(current['serial'], 'SERIAL42')
        self.assertEqual(current['unitImages'], ['/saved-unit.png'])
        self.assertEqual(current['quantityKnown'], 1)
        self.assertEqual(self.client.get('/return/units/51').json['item']['legacyId'], 7)

    def test_quantity_confirmation_uses_same_record_and_does_not_repeat(self):
        item = self.start()[0]
        base = '/return/units/' + str(item['id'])
        self.assertEqual(self.client.post(base+'/inspection', json={'inspectionDate':'2026-10-01','serial':'S1'}).status_code,400)
        report = self.client.get('/return/monthly-report').json
        self.assertEqual(report['pendingQuantity'],1)
        self.assertEqual(report['totals']['received'],0)
        for value in [0,101,True,1.5,'2']:
            self.assertEqual(self.client.post(base+'/quantity',json={'quantity':value}).status_code,400)
        response = self.client.post(base+'/quantity',json={'quantity':3})
        self.assertEqual(response.status_code,200,response.json)
        self.assertEqual(response.json['ids'][0],item['id'])
        detail = self.client.get(base).json['item']
        self.assertEqual(detail['groupSize'],3)
        self.assertEqual(detail['quantityKnown'],1)
        self.assertEqual([s['unitIndex'] for s in detail['siblings']],[2,3])
        self.assertTrue(all(s['OrderNumber']=='ORDER-7' and s['Recorded']==1 for s in detail['siblings']))
        self.assertEqual(self.client.post(base+'/quantity',json={'quantity':3}).status_code,400)
        self.assertEqual(self.client.get('/return/monthly-report').json['totals']['received'],3)
        self.assertEqual(self.client.post(base+'/inspection',json={'inspectionDate':'2026-10-01','serial':'S1'}).status_code,200)
        other = '/return/units/' + str(detail['siblings'][0]['id'])
        self.assertEqual(self.client.post(other+'/inspection',json={'inspectionDate':'2026-10-01','serial':'s1'}).status_code,400)

    def test_new_receipts_and_old_edits_share_storage_and_trash_preserves_old_fields(self):
        item = self.start()[0]
        new = self.client.post('/return/units',data={'payload':json.dumps({'tracking':'OLD-TRACK','receivedDate':'2026-10-01','company':'Acme','quantity':2,'units':[{'laptop':'Dell','upc':'A'},{'laptop':'HP','upc':'B'}]})})
        self.assertEqual(new.status_code,201,new.json)
        self.assertEqual(len(self.client.get('/return/units').json['items']),3)
        previous = self.client.post('/return/', json={'recorded': ['recorded', 'not_recorded']})
        self.assertEqual(previous.status_code, 200)
        self.assertEqual([row['id'] for row in previous.json], [item['id']])
        changed = self.client.post('/return/edit/OLD-TRACK',data={'OrderNumber':'UPDATED','remark':'Changed through previous receiving'})
        self.assertEqual(changed.status_code,200)
        detail = self.client.get('/return/units/'+str(item['id'])).json['item']
        self.assertEqual(detail['OrderNumber'],'UPDATED')
        self.assertEqual(detail['remark'],'Changed through previous receiving')
        self.assertEqual(self.client.delete('/return/admin/units/'+str(item['id']),json={'confirmFileNo':item['fileNo']}).status_code,200)
        trash = self.client.get('/return/admin/trash').json['items'][0]
        self.assertEqual(self.client.post('/return/admin/restore/'+str(trash['id'])).status_code,200)
        restored = self.client.get('/return/units/'+str(item['id'])).json['item']
        self.assertEqual((restored['legacyId'],restored['Code'],restored['OrderNumber'],restored['quantityKnown']),(7,'PC','UPDATED',0))

    def test_read_only_department_cannot_confirm_quantity(self):
        item = self.start()[0]
        with closing(sqlite3.connect(self.path)) as db, db:
            db.execute("INSERT INTO RMA_departments (name) VALUES ('ViewOnly')")
            db.execute("INSERT INTO RMA_department_permissions VALUES ('ViewOnly','return.view')")
            db.execute('INSERT INTO RMA_users (username,password_hash,role,department) VALUES (?,?,?,?)',('viewer',generate_password_hash('viewer-test-password'),'normal','ViewOnly'))
        viewer = self.app.test_client()
        self.assertEqual(viewer.post('/auth/api/login',json={'username':'viewer','password':'viewer-test-password'}).status_code,200)
        self.assertEqual(viewer.post('/return/units/'+str(item['id'])+'/quantity',json={'quantity':2}).status_code,403)

    def test_receiving_serials_persist_without_inspection_and_reject_duplicates_atomically(self):
        self.start()

        def receive(units):
            return self.client.post('/return/units', data={'payload': json.dumps({
                'receivedDate': '2026-10-07', 'tracking': 'TRACK', 'company': 'Acme', 'quantity': len(units),
                'units': [dict(unit, upc='00123') for unit in units]})})

        result = receive([{'laptop': 'Keyboard', 'serial': '  KEY-100  '},
                          {'laptop': 'Mouse', 'serial': 'MOUSE-100'}, {}, {'serial': '  '}])
        self.assertEqual(result.status_code, 201, result.json)
        ids = result.json['ids']
        item = self.client.get('/return/units/' + str(ids[0])).json['item']
        self.assertEqual((item['laptop'], item['serial']), ('Keyboard', 'KEY-100'))
        self.assertIsNone(item['inspectionDate'])
        self.assertEqual(item['siblings'][0]['serial'], 'MOUSE-100')
        self.assertEqual(item['siblings'][1]['serial'], '')
        self.assertEqual(self.client.post('/return/units/' + str(ids[0]) + '/inspection',
            json={'inspectionDate': '2026-10-07', 'serial': 'KEY-100'}).status_code, 200)

        for units in [[{'serial': 'NEW-100'}, {'serial': ' key-100 '}],
                      [{'serial': 'SAME'}, {'serial': ' same '}],
                      [{'serial': 'X' * 256}]]:
            rejected = receive(units)
            self.assertEqual(rejected.status_code, 400, rejected.json)
            self.assertEqual(len(self.client.get('/return/units').json['items']), 5)
        self.assertEqual(receive([{'serial': 'NEW-100'}]).status_code, 201)

        # Inspection cannot reuse a serial captured on another item at receiving.
        duplicate = self.client.post('/return/units/' + str(ids[2]) + '/inspection',
            json={'inspectionDate': '2026-10-07', 'serial': 'mouse-100'})
        self.assertEqual(duplicate.status_code, 400)


if __name__ == '__main__':
    unittest.main()
