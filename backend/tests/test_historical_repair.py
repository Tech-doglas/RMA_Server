import json
import os
from pathlib import Path
import sqlite3
import sys
import tempfile
import unittest
from contextlib import closing
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).parents[1]))
from app.local_database import LocalConnection, initialize_local_database
from repair_historical_receipts import main, read_records, repair, is_candidate


class HistoricalRepairTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory(dir=Path(__file__).parent)
        self.addCleanup(self.folder.cleanup)
        self.path = str(Path(self.folder.name) / 'test.sqlite3')
        initialize_local_database(self.path)
        with closing(sqlite3.connect(self.path)) as db, db:
            db.execute('''INSERT INTO RMA_return_receiving
                (id, TrackingNumber, Company, Code, Remark, OrderNumber, Recorded, CreationDateTime)
                VALUES (1, 'OLD-LATE', 'Snowbell', 'PC', 'Keep note', 'Order1', 1, '2026-10-15 12:00:00')''')
            db.execute("INSERT INTO RMA_return_receiving (id, TrackingNumber, groupId, upc) VALUES (2, 'NEW', 'g_real', '00123')")
            db.execute("INSERT INTO RMA_return_receiving (id, TrackingNumber, serial, serialKey) VALUES (3, 'AMBIGUOUS', 'S1', 's1')")

    def all_rows(self):
        with closing(sqlite3.connect(self.path)) as db:
            db.row_factory = sqlite3.Row
            return [dict(row) for row in db.execute('SELECT * FROM RMA_return_receiving ORDER BY id')]

    def test_reclassifies_only_old_style_preserves_content_and_is_idempotent(self):
        before = self.all_rows()
        with closing(LocalConnection(self.path)) as db:
            self.assertEqual([r['id'] for r in read_records(db.cursor()) if is_candidate(r)], [1])
            self.assertEqual(repair(db, 1), 1)
        after = self.all_rows()
        expected = dict(before[0], legacyId=1, groupId='legacy_1', quantityKnown=0)
        self.assertEqual(after, [expected, *before[1:]])
        with closing(LocalConnection(self.path)) as db:
            self.assertEqual(repair(db, 0), 0)
        with closing(sqlite3.connect(self.path)) as db:
            events = db.execute('SELECT action, target, snapshot FROM RMA_return_admin_audit').fetchall()
            self.assertEqual(len(events), 1)
            self.assertEqual(events[0][:2], ('classify historical receipt', '1'))
            self.assertEqual(json.loads(events[0][2])['legacyId'], None)

    def test_count_change_aborts_without_writes(self):
        before = self.all_rows()
        with closing(LocalConnection(self.path)) as db:
            with self.assertRaisesRegex(RuntimeError, 'Candidate count changed'):
                repair(db, 46)
        self.assertEqual(self.all_rows(), before)

    def test_conflict_rolls_back_earlier_updates_and_audit(self):
        with closing(sqlite3.connect(self.path)) as db, db:
            db.execute('INSERT INTO RMA_return_receiving (id) VALUES (4)')
            db.execute("INSERT INTO RMA_return_receiving (id, legacyId, groupId, quantityKnown) VALUES (5,4,'legacy_other',0)")
        before = self.all_rows()
        with closing(LocalConnection(self.path)) as db:
            with self.assertRaisesRegex(RuntimeError, 'Historical ID conflict'):
                repair(db, 2)
        self.assertEqual(self.all_rows(), before)
        with closing(sqlite3.connect(self.path)) as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM RMA_return_admin_audit').fetchone()[0], 0)

    def test_modern_metadata_prevents_reclassification(self):
        row = self.all_rows()[0]
        for field, value in [('groupId', 'g_real'), ('quantityKnown', 0), ('unitIndex', 2),
                             ('images', '["/photo.jpg"]'), ('unitImages', 'invalid'),
                             ('upc', '0012345'), ('shipBatchNumber', 3), ('bulkType', 'BULK_NEW')]:
            with self.subTest(field=field):
                self.assertFalse(is_candidate(dict(row, **{field: value})))

    def test_failed_backup_never_repairs(self):
        connection = MagicMock()
        with patch.dict(os.environ, {'DATABASE_BACKEND': 'mssql'}), \
                patch.object(sys, 'argv', ['repair_historical_receipts.py', '--apply', '--application-stopped', '--expected-count', '1']), \
                patch('repair_historical_receipts.create_app'), \
                patch('repair_historical_receipts.get_db_connection', return_value=connection), \
                patch('repair_historical_receipts.read_records', return_value=self.all_rows()), \
                patch('repair_historical_receipts.backup_database', side_effect=RuntimeError('Backup failed')), \
                patch('repair_historical_receipts.repair') as apply:
            with self.assertRaisesRegex(RuntimeError, 'Backup failed'):
                main()
        apply.assert_not_called()
        connection.close.assert_called_once()

    def test_default_report_does_not_backup_or_repair(self):
        connection = MagicMock()
        with patch.dict(os.environ, {'DATABASE_BACKEND': 'mssql'}), \
                patch.object(sys, 'argv', ['repair_historical_receipts.py']), \
                patch('repair_historical_receipts.create_app'), \
                patch('repair_historical_receipts.get_db_connection', return_value=connection), \
                patch('repair_historical_receipts.read_records', return_value=self.all_rows()), \
                patch('repair_historical_receipts.backup_database') as backup, \
                patch('repair_historical_receipts.repair') as apply:
            main()
        backup.assert_not_called()
        apply.assert_not_called()


if __name__ == '__main__':
    unittest.main()
