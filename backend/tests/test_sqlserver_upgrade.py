import os
from pathlib import Path
import sys
import unittest
from unittest.mock import MagicMock, patch

import pyodbc

sys.path.insert(0, str(Path(__file__).parents[1]))
from upgrade_sqlserver import main, apply_migrations


class UpgradeSafetyTests(unittest.TestCase):
    def test_failed_backup_prevents_any_migrations(self):
        connection = MagicMock()
        connection.cursor().fetchone.return_value = (1,)
        with patch.dict(os.environ, {'DATABASE_BACKEND': 'mssql'}), \
                patch.object(sys, 'argv', ['upgrade_sqlserver.py', '--apply', '--application-stopped']), \
                patch('upgrade_sqlserver.create_app'), \
                patch('upgrade_sqlserver.get_db_connection', return_value=connection), \
                patch('upgrade_sqlserver.backup_database', side_effect=RuntimeError('backup failed')), \
                patch('upgrade_sqlserver.apply_migrations') as apply:
            with self.assertRaisesRegex(RuntimeError, 'backup failed'):
                main()
        apply.assert_not_called()
        connection.close.assert_called_once()

    def test_failed_final_schema_check_rolls_back(self):
        connection = MagicMock()
        cursor = connection.cursor()
        cursor.nextset.return_value = False
        def execute(query):
            if query.startswith('SELECT TOP (0)'):
                raise pyodbc.ProgrammingError('missing schema')
        cursor.execute.side_effect = execute
        with self.assertRaises(pyodbc.ProgrammingError):
            apply_migrations(connection, Path(__file__).parents[1] / 'migrations')
        connection.commit.assert_not_called()
        connection.rollback.assert_called_once()

    def test_existing_permission_denial_prevents_backup_and_migration(self):
        connection = MagicMock()
        connection.cursor().fetchone.return_value = (0,)
        with patch.dict(os.environ, {'DATABASE_BACKEND': 'mssql'}), \
                patch.object(sys, 'argv', ['upgrade_sqlserver.py', '--apply', '--application-stopped']), \
                patch('upgrade_sqlserver.create_app'), \
                patch('upgrade_sqlserver.get_db_connection', return_value=connection), \
                patch('upgrade_sqlserver.backup_database') as backup, \
                patch('upgrade_sqlserver.apply_migrations') as apply:
            with self.assertRaisesRegex(RuntimeError, 'SQL administrator'):
                main()
        backup.assert_not_called()
        apply.assert_not_called()
        connection.close.assert_called_once()


if __name__ == '__main__':
    unittest.main()
