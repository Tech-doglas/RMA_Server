"""Report and explicitly reclassify old-style receipts inserted after SQL upgrade."""
import argparse
import json
import os
from pathlib import PurePosixPath

import pyodbc

from app import create_app
from app.models import get_db_connection
from upgrade_sqlserver import backup_database, drain

TABLE = 'RMA_return_receiving'
COLUMNS = ('id', 'groupId', 'legacyId', 'quantityKnown', 'unitIndex',
           'laptop', 'upc', 'itemName', 'itemInfo', 'serial', 'serialKey',
           'inspectionDate', 'pallet', 'inspectionRemark', 'shipDate',
           'shipBatch', 'shipBatchNumber', 'images', 'unitImages', 'bulkType')


def blank(value):
    return value is None or str(value).strip() == ''


def is_candidate(row):
    # Current receiving always writes a nonempty delivery UUID. Do not infer
    # history from a date, missing item name, or an uninspected status alone.
    if row['legacyId'] is not None or not blank(row['groupId']):
        return False
    if row['quantityKnown'] != 1 or row['unitIndex'] != 1:
        return False
    if any(not blank(row[name]) for name in COLUMNS[5:17]):
        return False
    if str(row['bulkType'] or '').strip().upper() not in ('', 'REGULAR'):
        return False
    for name in ('images', 'unitImages'):
        try:
            if json.loads(row[name] or '[]') != []:
                return False
        except (ValueError, TypeError):
            return False
    return True


def read_records(cursor, lock=False):
    hint = ' WITH (TABLOCKX, HOLDLOCK)' if lock else ''
    cursor.execute(f"SELECT {', '.join(COLUMNS)} FROM {TABLE}{hint} ORDER BY id")
    return [dict(zip(COLUMNS, row)) for row in cursor.fetchall()]


def report(records):
    candidates = [row for row in records if is_candidate(row)]
    current = [row for row in records if row['legacyId'] is None
               and not str(row['groupId'] or '').startswith('legacy_')]
    print(f'Total records: {len(records)}')
    print(f'Currently in Returns: {len(current)}')
    print(f'Old-style candidates for Previous records: {len(candidates)}')
    print(f'Returns records needing separate review: {len(current) - len(candidates)}')
    for row in current:
        kind = 'candidate' if is_candidate(row) else 'review separately (not changed)'
        print(f"sid-{row['id']:04d}: {kind}")
    return candidates


def repair(connection, expected_count):
    """Caller must have verified a backup and stopped writers. Commit atomically."""
    cursor = connection.cursor()
    try:
        records = read_records(cursor, lock=True)
        candidates = [row for row in records if is_candidate(row)]
        if len(candidates) != expected_count:
            raise RuntimeError(f'Candidate count changed: expected {expected_count}, found {len(candidates)}. Run the report again.')
        legacy_ids = {row['legacyId'] for row in records if row['legacyId'] is not None}
        groups = {row['groupId'] for row in records if not blank(row['groupId'])}
        for row in candidates:
            record_id = row['id']
            group = 'legacy_' + str(record_id)
            if record_id in legacy_ids or group in groups:
                raise RuntimeError(f'Historical ID conflict for sid-{record_id:04d}; no changes committed.')
            cursor.execute(f'''UPDATE {TABLE} SET legacyId = ?, groupId = ?, quantityKnown = 0
                WHERE id = ?''', record_id, group, record_id)
            cursor.execute('''INSERT INTO RMA_return_admin_audit (username, action, target, snapshot)
                VALUES (?, ?, ?, ?)''', 'system:historical-repair', 'classify historical receipt',
                str(record_id), json.dumps({key: row[key] for key in ('id', 'legacyId', 'groupId', 'quantityKnown')}))
        connection.commit()
        return len(candidates)
    except Exception:
        connection.rollback()
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--application-stopped', action='store_true')
    parser.add_argument('--expected-count', type=int)
    parser.add_argument('--backup-dir', default='/var/opt/mssql/backup')
    args = parser.parse_args()
    if os.environ.get('DATABASE_BACKEND', '').lower() != 'mssql':
        parser.error('DATABASE_BACKEND must be mssql.')
    if args.apply and (not args.application_stopped or args.expected_count is None or args.expected_count < 1):
        parser.error('Apply requires --application-stopped and --expected-count with the positive candidate count from the report.')
    if not args.backup_dir.startswith('/') or '..' in PurePosixPath(args.backup_dir).parts:
        parser.error('Use an absolute backup directory inside the SQL Server container.')
    app = create_app()
    with app.app_context():
        connection = get_db_connection()
        try:
            candidates = report(read_records(connection.cursor()))
            connection.rollback()
            if not args.apply:
                print('Read-only report. No database changes made.')
                return
            if len(candidates) != args.expected_count:
                raise RuntimeError('Expected count does not match the report. No changes made.')
            connection.timeout = 300
            backup_database(connection, args.backup_dir)
            connection.autocommit = False
            cursor = connection.cursor()
            cursor.execute('SET XACT_ABORT ON; SET LOCK_TIMEOUT 15000;')
            drain(cursor)
            count = repair(connection, args.expected_count)
            print(f'Moved {count} receipts to Previous records. IDs, dates, tracking, company, notes and photos preserved.')
            print('Historical quantity is unconfirmed. Other Returns records were not changed.')
        finally:
            connection.close()


if __name__ == '__main__':
    try:
        main()
    except pyodbc.Error:
        raise SystemExit('Repair failed. No uncommitted changes were saved. Check SQL permissions, schema and backup directory.') from None
    except RuntimeError as error:
        raise SystemExit(str(error)) from None
