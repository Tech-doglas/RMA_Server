"""Persistent SQLite storage for local receiving, with no database service."""
import os
import re
import sqlite3
from contextlib import closing
from datetime import date, datetime


SCHEMA = '''
CREATE TABLE IF NOT EXISTS RMA_revoked_sessions (
    token_hash TEXT PRIMARY KEY,
    expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS RMA_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL COLLATE NOCASE UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'normal',
    department TEXT NOT NULL,
    isActive INTEGER NOT NULL DEFAULT 1,
    approvalStatus TEXT NOT NULL DEFAULT 'approved'
);
CREATE TABLE IF NOT EXISTS RMA_return_units (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    tracking TEXT NOT NULL DEFAULT '',
    laptop TEXT NOT NULL DEFAULT '',
    receivedDate DATE NOT NULL,
    remark TEXT NOT NULL DEFAULT '',
    images TEXT NOT NULL DEFAULT '[]',
    inspectionDate DATE,
    pallet TEXT NOT NULL DEFAULT '',
    serial TEXT NOT NULL DEFAULT '',
    serialKey TEXT UNIQUE,
    groupId TEXT NOT NULL,
    unitIndex INTEGER NOT NULL,
    unitImages TEXT NOT NULL DEFAULT '[]',
    inspectionRemark TEXT NOT NULL DEFAULT '',
    shipDate DATE,
    shipBatch TEXT NOT NULL DEFAULT '',
    shipBatchNumber INTEGER,
    bulkType TEXT NOT NULL DEFAULT 'REGULAR',
    company TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS IX_return_units_group ON RMA_return_units(groupId);
CREATE INDEX IF NOT EXISTS IX_return_units_tracking ON RMA_return_units(tracking);
CREATE INDEX IF NOT EXISTS IX_return_units_pallet ON RMA_return_units(pallet);
CREATE TABLE IF NOT EXISTS RMA_return_bulk_types (name TEXT PRIMARY KEY);
CREATE TABLE IF NOT EXISTS RMA_return_companies (name TEXT PRIMARY KEY);
CREATE TABLE IF NOT EXISTS RMA_return_pallet_status (
    pallet TEXT PRIMARY KEY COLLATE NOCASE,
    status TEXT NOT NULL CHECK (status IN ('OPEN', 'LOCKED', 'FULL'))
);
CREATE TABLE IF NOT EXISTS RMA_departments (name TEXT PRIMARY KEY COLLATE NOCASE);
CREATE TABLE IF NOT EXISTS RMA_department_permissions (
    department TEXT NOT NULL COLLATE NOCASE REFERENCES RMA_departments(name) ON UPDATE CASCADE ON DELETE CASCADE,
    permission TEXT NOT NULL,
    PRIMARY KEY (department, permission)
);
CREATE TABLE IF NOT EXISTS RMA_return_shipping_batches (
    batchNumber INTEGER PRIMARY KEY,
    shipDate DATE NOT NULL
);
CREATE TABLE IF NOT EXISTS RMA_return_admin_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    username TEXT NOT NULL,
    action TEXT NOT NULL,
    target TEXT NOT NULL,
    snapshot TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS RMA_return_receiving (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    TrackingNumber TEXT NOT NULL UNIQUE,
    Company TEXT NOT NULL DEFAULT '',
    Code TEXT NOT NULL DEFAULT '',
    Remark TEXT NOT NULL DEFAULT '',
    CreationDateTime DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    OrderNumber TEXT NOT NULL DEFAULT '',
    Recorded INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS RMA_laptop_sheet (
    ID INTEGER PRIMARY KEY AUTOINCREMENT,
    Brand TEXT, Model TEXT, Spec TEXT, SerialNumber TEXT, OdooRef TEXT,
    Condition TEXT, Sealed INTEGER DEFAULT 0, Stock TEXT DEFAULT '',
    Remark TEXT, OdooRecord INTEGER DEFAULT 0, LastModifiedUser TEXT,
    TechDoneDate DATETIME, LastModifiedDateTime DATETIME,
    InputDate DATETIME DEFAULT CURRENT_TIMESTAMP, InputUser TEXT,
    TechDone INTEGER DEFAULT 0, OrderNumber TEXT, UpDatedSpec TEXT,
    SKU TEXT, SaleDate DATETIME
);
CREATE TABLE IF NOT EXISTS RMA_non_laptop_sheet (
    ID INTEGER PRIMARY KEY AUTOINCREMENT,
    TrackingNumber TEXT, Category TEXT, Name TEXT, OdooRef TEXT,
    Condition TEXT, ReceivedDate DATE, OdooRecord INTEGER DEFAULT 0,
    Remark TEXT, LastModifiedUser TEXT, LastModifiedDateTime DATETIME,
    Location TEXT, InputDate DATETIME DEFAULT CURRENT_TIMESTAMP,
    OrderNumber TEXT, SaleDate DATETIME, SKU TEXT,
    OrderDistributed INTEGER DEFAULT 0, InspectionRequest TEXT,
    ReadyToSale INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS xie_laptop_return (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_number TEXT, tracking_number TEXT, laptop_name TEXT,
    customer_name TEXT, remark TEXT, serial_number TEXT, return_id TEXT,
    condition TEXT, location TEXT, tracking_received_date TEXT,
    inspection_date TEXT, delivery_date TEXT,
    last_modified_user TEXT, last_modified_datetime DATETIME,
    return_type TEXT
);
CREATE VIEW IF NOT EXISTS RMA_user AS SELECT username FROM RMA_users;
'''

sqlite3.register_converter('DATE', lambda value: date.fromisoformat(value.decode()))
sqlite3.register_converter('DATETIME', lambda value: datetime.fromisoformat(value.decode()))


def initialize_local_database(path):
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with closing(sqlite3.connect(path, timeout=10)) as connection, connection:
        connection.execute('PRAGMA journal_mode = WAL')
        new_types = not connection.execute("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'RMA_return_bulk_types'").fetchone()
        new_companies = not connection.execute("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'RMA_return_companies'").fetchone()
        new_permissions = not connection.execute("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'RMA_departments'").fetchone()
        connection.executescript(SCHEMA)
        if new_permissions:
            from app.permissions import DEFAULT_DEPARTMENTS, default_permissions
            departments = set(DEFAULT_DEPARTMENTS) | {row[0] for row in connection.execute('SELECT DISTINCT department FROM RMA_users') if row[0]}
            connection.executemany('INSERT OR IGNORE INTO RMA_departments (name) VALUES (?)', [(name,) for name in departments])
            for department in departments:
                connection.executemany('INSERT INTO RMA_department_permissions (department, permission) VALUES (?, ?)',
                                       [(department, action) for action in default_permissions(department)])
        if new_companies:
            connection.executemany('INSERT INTO RMA_return_companies (name) VALUES (?)',
                                   [('SNOWBELL/XIE/PITY TECH',), ('PX/LEO/KRIZY',), ('Others',)])
            connection.execute('''INSERT OR IGNORE INTO RMA_return_companies (name)
                SELECT DISTINCT TRIM(company) FROM RMA_return_units WHERE TRIM(COALESCE(company, '')) <> '' ''')
        connection.execute('''INSERT OR IGNORE INTO RMA_return_shipping_batches (batchNumber, shipDate)
            SELECT shipBatchNumber, MIN(shipDate) FROM RMA_return_units
            WHERE shipBatchNumber IS NOT NULL AND shipDate IS NOT NULL GROUP BY shipBatchNumber''')
        if 'isActive' not in {row[1] for row in connection.execute('PRAGMA table_info(RMA_users)')}:
            connection.execute('ALTER TABLE RMA_users ADD COLUMN isActive INTEGER NOT NULL DEFAULT 1')
        if 'approvalStatus' not in {row[1] for row in connection.execute('PRAGMA table_info(RMA_users)')}:
            connection.execute("ALTER TABLE RMA_users ADD COLUMN approvalStatus TEXT NOT NULL DEFAULT 'approved'")
        if new_types:
            connection.executemany('INSERT INTO RMA_return_bulk_types (name) VALUES (?)', [('REGULAR',), ('BULK_NEW',)])
            connection.execute('''INSERT OR IGNORE INTO RMA_return_bulk_types (name)
                SELECT DISTINCT UPPER(TRIM(bulkType)) FROM RMA_return_units WHERE TRIM(COALESCE(bulkType, '')) <> '' ''')
        connection.execute("UPDATE RMA_return_units SET bulkType = UPPER(TRIM(bulkType)) WHERE bulkType <> UPPER(TRIM(bulkType))")
        connection.execute("UPDATE RMA_return_units SET bulkType = 'REGULAR' WHERE TRIM(COALESCE(bulkType, '')) = ''")


class LocalCursor:
    """Accept the receiving routes' ODBC parameter convention and SQL syntax."""
    def __init__(self, cursor):
        self.cursor = cursor
        self.returned = None

    def execute(self, query, *params):
        self.returned = None
        if len(params) == 1 and isinstance(params[0], (tuple, list)):
            params = params[0]
        # SQLite's transaction already holds the write lock before reads.
        query = re.sub(r'\s+WITH\s*\((?:UPDLOCK|HOLDLOCK|TABLOCKX|[,\s])+\)', '', query, flags=re.I)
        query = re.sub(r'CONVERT\(DATE,\s*(\w+)\)', r'DATE(\1)', query, flags=re.I)
        query = re.sub(r'GETDATE\(\)', 'CURRENT_TIMESTAMP', query, flags=re.I)
        query = re.sub(r'RIGHT\((\w+),\s*(\d+)\)', r'SUBSTR(\1, -\2)', query, flags=re.I)
        query = re.sub(r'SUBSTRING\(', 'SUBSTR(', query, flags=re.I)
        output = bool(re.search(r'\bOUTPUT\s+INSERTED\.id\b', query, flags=re.I))
        if output:
            query = re.sub(r'\bOUTPUT\s+INSERTED\.id\b', '', query, flags=re.I).rstrip().rstrip(';') + ' RETURNING id'
        self.cursor.execute(query, params)
        if output:
            # Consume RETURNING before commit, including legacy routes that skip fetch.
            self.returned = list(self.cursor.fetchall())
        return self

    @property
    def description(self):
        return self.cursor.description

    def fetchone(self):
        if self.returned is not None:
            return self.returned.pop(0) if self.returned else None
        return self.cursor.fetchone()

    def fetchall(self):
        if self.returned is not None:
            result, self.returned = self.returned, []
            return result
        return self.cursor.fetchall()


class LocalConnection:
    def __init__(self, path):
        self.connection = sqlite3.connect(path, timeout=10, detect_types=sqlite3.PARSE_DECLTYPES)
        self.connection.execute('PRAGMA foreign_keys = ON')
        # Serial uniqueness checks and shipment batch allocation stay atomic.
        self.connection.execute('BEGIN IMMEDIATE')

    def cursor(self):
        return LocalCursor(self.connection.cursor())

    def commit(self):
        self.connection.commit()

    def rollback(self):
        self.connection.rollback()

    def close(self):
        self.connection.close()
