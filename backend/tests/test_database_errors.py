import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parents[1]))
import pyodbc
from app import create_app


class DatabaseErrorsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = create_app({'DATABASE_BACKEND': 'mssql'})
        cls.client = cls.app.test_client()

    def test_missing_driver_returns_clear_json_for_login_registration_and_returns(self):
        with patch('app.models.pyodbc.drivers', return_value=[]), patch('app.models.pyodbc.connect') as connect:
            for endpoint, payload in [
                ('/auth/api/login', dict(username='test-only', password='test-only')),
                ('/auth/api/register', dict(username='test-only', password='test-only-password', department='Tech')),
            ]:
                response = self.client.post(endpoint, json=payload)
                self.assertEqual(response.status_code, 503)
                self.assertIn('install ODBC Driver 18', response.json['error'])
            response = self.client.get('/return/units')
            self.assertEqual(response.status_code, 401)
            self.assertTrue(response.is_json)
            connect.assert_not_called()

    def test_unreachable_database_returns_clear_json_without_driver_details(self):
        with patch('app.models.pyodbc.drivers', return_value=['ODBC Driver 18 for SQL Server']), patch('app.models.pyodbc.connect', side_effect=pyodbc.OperationalError('08001', 'private connection details')):
            response = self.client.post('/auth/api/login', json=dict(username='test-only', password='test-only'))
        self.assertEqual(response.status_code, 503)
        self.assertIn('SQL Server address', response.json['error'])
        self.assertNotIn('private connection details', response.json['error'])

    def test_authentication_password_is_redacted_from_request_logging(self):
        with patch('app.models.pyodbc.drivers', return_value=[]), patch.object(self.app.logger, 'error') as log:
            self.client.post('/auth/api/login', json=dict(username='test-only', password='do-not-log-this'))
        messages = str(log.call_args_list)
        self.assertNotIn('do-not-log-this', messages)
        self.assertNotIn('Body:', messages)


if __name__ == '__main__':
    unittest.main()
