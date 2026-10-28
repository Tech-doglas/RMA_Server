"""One receiving table for historical deliveries and the current unit workflow."""
import sqlite3
from contextlib import closing
from datetime import datetime
from pathlib import Path

TABLE = 'RMA_return_receiving'
API_COLUMNS = {'CreationDateTime': 'timestamp', 'TrackingNumber': 'tracking',
               'Company': 'company', 'Remark': 'remark'}
STORAGE_COLUMNS = {value: key for key, value in API_COLUMNS.items()}


def receiving_schema(table=TABLE):
    return f'''CREATE TABLE {table} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        TrackingNumber TEXT NOT NULL DEFAULT '',
        Company TEXT NOT NULL DEFAULT '', Code TEXT NOT NULL DEFAULT '',
        Remark TEXT NOT NULL DEFAULT '',
        CreationDateTime DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        OrderNumber TEXT NOT NULL DEFAULT '', Recorded INTEGER NOT NULL DEFAULT 0,
        laptop TEXT NOT NULL DEFAULT '', upc TEXT NOT NULL DEFAULT '', itemName TEXT NOT NULL DEFAULT '', itemInfo TEXT NOT NULL DEFAULT '', receivedDate DATE NOT NULL DEFAULT CURRENT_DATE,
        images TEXT NOT NULL DEFAULT '[]', inspectionDate DATE,
        pallet TEXT NOT NULL DEFAULT '', serial TEXT NOT NULL DEFAULT '', serialKey TEXT UNIQUE,
        groupId TEXT NOT NULL DEFAULT '', unitIndex INTEGER NOT NULL DEFAULT 1,
        unitImages TEXT NOT NULL DEFAULT '[]', inspectionRemark TEXT NOT NULL DEFAULT '',
        shipDate DATE, shipBatch TEXT NOT NULL DEFAULT '', shipBatchNumber INTEGER,
        bulkType TEXT NOT NULL DEFAULT 'REGULAR',
        legacyId INTEGER UNIQUE, quantityKnown INTEGER NOT NULL DEFAULT 1 CHECK (quantityKnown IN (0,1))
    )'''


def upgrade_receiving(connection, path):
    """Atomically consolidate the former unit table; keep its printed IDs unchanged.

    Legacy IDs remain in legacyId. Historical records get unused File Numbers
    above the old unit sequence (including deleted IDs), never fabricated units.
    The temporary table exists only while removing SQLite's tracking UNIQUE rule.
    """
    tables = {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    if TABLE not in tables:
        connection.execute(receiving_schema())
        if 'RMA_return_units' not in tables:
            connection.commit()
            return None
    columns = {row[1] for row in connection.execute(f'PRAGMA table_info({TABLE})')}
    if 'quantityKnown' in columns and 'RMA_return_units' not in tables:
        for field in ('upc', 'itemName', 'itemInfo'):
            if field not in columns:
                connection.execute(f"ALTER TABLE {TABLE} ADD COLUMN {field} TEXT NOT NULL DEFAULT ''")
        connection.commit()
        return None
    if 'quantityKnown' in columns:
        raise RuntimeError('Both upgraded receiving storage and an old unit table exist. Review before merging again.')
    backup_path = Path(path).resolve().parent / 'backups' / ('before-unified-receiving-' + datetime.now().strftime('%Y%m%d-%H%M%S-%f') + '.sqlite3')
    backup_path.parent.mkdir(exist_ok=True)
    with closing(sqlite3.connect(backup_path)) as backup:
        connection.backup(backup)
        if backup.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
            raise RuntimeError('The receiving migration backup failed validation.')
    connection.execute('BEGIN IMMEDIATE')
    try:
        previous_factory = connection.row_factory
        connection.row_factory = sqlite3.Row
        legacy = [dict(row) for row in connection.execute(f'SELECT * FROM {TABLE} ORDER BY id')]
        units = [dict(row) for row in connection.execute('SELECT * FROM RMA_return_units ORDER BY id')] if 'RMA_return_units' in tables else []
        connection.row_factory = previous_factory
        # Reserve IDs of deleted records as well so trash restoration remains safe.
        high = max([row['id'] for row in units] + [0])
        if 'sqlite_sequence' in tables:
            high = max(high, connection.execute("SELECT COALESCE(MAX(seq),0) FROM sqlite_sequence WHERE name='RMA_return_units'").fetchone()[0])
        if 'RMA_return_admin_audit' in tables:
            for target, in connection.execute("SELECT target FROM RMA_return_admin_audit WHERE action='remove unit'"):
                if str(target).isdigit():
                    high = max(high, int(target))
        temporary = TABLE + '__upgrade'
        connection.execute(receiving_schema(temporary))
        allowed = {row[1] for row in connection.execute(f'PRAGMA table_info({temporary})')}

        def insert(item):
            if set(item) - allowed:
                raise RuntimeError('Unmapped receiving fields: ' + ', '.join(sorted(set(item) - allowed)))
            names = list(item)
            connection.execute(f'INSERT INTO {temporary} ({",".join(names)}) VALUES ({",".join("?" for _ in names)})', [item[name] for name in names])

        for item in units:
            insert({STORAGE_COLUMNS.get(key, key): value for key, value in item.items()})
        for index, original in enumerate(legacy, 1):
            item = dict(original)
            old_id = item['id']
            item.update(id=high + index, legacyId=old_id, quantityKnown=0,
                        groupId='legacy_' + str(old_id), unitIndex=1,
                        receivedDate=datetime.fromisoformat(str(item['CreationDateTime'])).date().isoformat())
            insert(item)
        count = connection.execute(f'SELECT COUNT(*) FROM {temporary}').fetchone()[0]
        if count != len(legacy) + len(units):
            raise RuntimeError('Receiving counts did not match; migration rolled back.')
        # Verify every original field before retiring either previous storage table.
        for original in legacy:
            names = [name for name in original if name != 'id']
            saved = connection.execute(f'SELECT {",".join(names)} FROM {temporary} WHERE legacyId=?', (original['id'],)).fetchone()
            if tuple(saved) != tuple(original[name] for name in names):
                raise RuntimeError('Historical receiving data mismatch; migration rolled back.')
        for original in units:
            names = [STORAGE_COLUMNS.get(name, name) for name in original]
            saved = connection.execute(f'SELECT {",".join(names)} FROM {temporary} WHERE id=?', (original['id'],)).fetchone()
            if tuple(saved) != tuple(original.values()):
                raise RuntimeError('Existing unit data mismatch; migration rolled back.')
        connection.execute(f'DROP TABLE {TABLE}')
        if 'RMA_return_units' in tables:
            connection.execute('DROP TABLE RMA_return_units')
        connection.execute(f'ALTER TABLE {temporary} RENAME TO {TABLE}')
        connection.execute('UPDATE sqlite_sequence SET seq = MAX(seq, ?) WHERE name = ?', (high, TABLE))
        if connection.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
            raise RuntimeError('Receiving integrity check failed.')
        connection.commit()
        return str(backup_path)
    except Exception:
        connection.rollback()
        raise
