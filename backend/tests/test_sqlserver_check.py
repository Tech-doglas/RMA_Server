import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

import pyodbc
from werkzeug.exceptions import ServiceUnavailable

sys.path.insert(0, str(Path(__file__).parents[1]))
from app.sqlserver_check import check_schema, diagnose_schema, REQUIRED_COLUMNS


class SqlServerPreflightTests(unittest.TestCase):
    def test_only_reads_column_metadata_and_closes_connection(self):
        connection = MagicMock()
        with patch('app.sqlserver_check.get_db_connection', return_value=connection):
            check_schema()
        queries = [call.args[0] for call in connection.cursor().execute.call_args_list]
        self.assertEqual(len(queries), len(REQUIRED_COLUMNS))
        self.assertTrue(all(query.startswith('SELECT TOP (0) ') for query in queries))
        self.assertTrue(all('FROM [dbo].[' in query for query in queries))
        connection.commit.assert_not_called()
        connection.close.assert_called_once()

    def test_missing_columns_stop_startup_without_disclosing_driver_details(self):
        connection = MagicMock()
        connection.cursor().execute.side_effect = pyodbc.ProgrammingError('sensitive driver detail')
        with patch('app.sqlserver_check.get_db_connection', return_value=connection):
            with self.assertRaisesRegex(RuntimeError, 'dbo.RMA_return_receiving') as error:
                check_schema()
        self.assertNotIn('sensitive driver detail', str(error.exception))
        self.assertEqual(connection.cursor().execute.call_count, 1)
        connection.close.assert_called_once()

    def test_connection_failure_has_actionable_message(self):
        with patch('app.sqlserver_check.get_db_connection',
                   side_effect=ServiceUnavailable(description='Check database credentials.')):
            with self.assertRaisesRegex(RuntimeError, 'Check database credentials'):
                check_schema()

    def test_diagnosis_reports_all_gaps_without_reading_records_or_driver_details(self):
        connection = MagicMock()
        cursor = connection.cursor()

        def execute(query):
            if '[dbo].[RMA_users]' in query:
                raise pyodbc.ProgrammingError('sensitive driver detail')
            table = query.split('[dbo].[')[1].split(']')[0]
            columns = REQUIRED_COLUMNS[table].split()
            if table == 'RMA_return_receiving':
                columns.remove('quantityKnown')
                columns.remove('unitImages')
            cursor.description = [(column,) for column in columns]

        cursor.execute.side_effect = execute
        with patch('app.sqlserver_check.get_db_connection', return_value=connection):
            issues = diagnose_schema()
        self.assertEqual(len(issues), 2)
        self.assertIn('missing columns: unitImages, quantityKnown', issues[0])
        self.assertIn('dbo.RMA_users: table unavailable', issues[1])
        self.assertNotIn('sensitive driver detail', ' '.join(issues))
        queries = [call.args[0] for call in cursor.execute.call_args_list]
        self.assertEqual(len(queries), len(REQUIRED_COLUMNS))
        self.assertTrue(all(query.startswith('SELECT TOP (0) * ') for query in queries))
        cursor.fetchall.assert_not_called()
        connection.commit.assert_not_called()
        connection.close.assert_called_once()

    def test_diagnosis_accepts_complete_schema(self):
        connection = MagicMock()
        cursor = connection.cursor()
        def execute(query):
            table = query.split('[dbo].[')[1].split(']')[0]
            cursor.description = [(column.upper(),) for column in REQUIRED_COLUMNS[table].split()]
        cursor.execute.side_effect = execute
        with patch('app.sqlserver_check.get_db_connection', return_value=connection):
            self.assertEqual(diagnose_schema(), [])
        connection.close.assert_called_once()


if __name__ == '__main__':
    unittest.main()
