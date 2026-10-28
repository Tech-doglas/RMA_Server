import os


class Config:
    SQL_SERVER = os.environ.get('SQL_SERVER', 'localhost')
    DATABASE = os.environ.get('SQL_DATABASE', 'RMA')
    UID = os.environ.get('SQL_USER', 'rma')
    PWD = os.environ.get('SQL_PASSWORD', '')
    DRIVER = os.environ.get('SQL_DRIVER', '{ODBC Driver 18 for SQL Server}')
    TRUST_CERT = os.environ.get('SQL_TRUST_CERT', 'no')
    MODI_RMA_DIR = '/vol1/1001/RMA'
