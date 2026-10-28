"""Explicit, backed-up SQL upgrade for the original production receiving layout."""
import argparse
from datetime import datetime, timezone
import os
from pathlib import Path, PurePosixPath
import uuid

import pyodbc

from app import create_app
from app.models import get_db_connection
from app.sqlserver_check import REQUIRED_COLUMNS, diagnose_schema

MIGRATIONS = (
    '011_legacy_production_upgrade.sql',
    '003_receiving_admin.sql', '004_admin_accounts.sql',
    '005_registration_approval.sql', '006_company_options.sql',
    '007_pallet_status.sql', '008_department_permissions.sql',
    '009_session_revocation.sql', '012_receiving_upc.sql', '013_receiving_item_details.sql',
)


def drain(cursor):
    while cursor.nextset():
        pass


def backup_database(connection, directory):
    """SQL Server writes to its own mounted backup directory, not this container."""
    connection.autocommit = True
    cursor = connection.cursor()
    cursor.execute('SELECT DB_NAME()')
    database = cursor.fetchone()[0]
    if database.lower() in ('master', 'model', 'msdb', 'tempdb'):
        raise RuntimeError('Refusing to upgrade a SQL Server system database.')
    quoted = '[' + database.replace(']', ']]') + ']'
    filename = 'RMA_before_upgrade_' + datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S') + '_' + uuid.uuid4().hex[:8] + '.bak'
    path = str(PurePosixPath(directory) / filename)
    cursor.execute(f'BACKUP DATABASE {quoted} TO DISK = ? WITH COPY_ONLY, CHECKSUM', path)
    drain(cursor)
    cursor.execute('RESTORE VERIFYONLY FROM DISK = ? WITH CHECKSUM', path)
    drain(cursor)
    print('SQL backup created and verified: ' + path, flush=True)
    return path


def apply_migrations(connection, directory):
    """All schema changes commit together. No account credentials/roles are edited."""
    connection.autocommit = False
    cursor = connection.cursor()
    try:
        # pyodbc owns the transaction; an explicit BEGIN would nest it and leave
        # DDL uncommitted after the ODBC commit, rolling it back on disconnect.
        cursor.execute('SET XACT_ABORT ON; SET LOCK_TIMEOUT 15000;')
        drain(cursor)
        for filename in MIGRATIONS:
            cursor.execute((directory / filename).read_text(encoding='utf-8'))
            drain(cursor)
            print('Checked upgrade step: ' + filename, flush=True)
        # Check within the transaction, before committing any changes.
        for table, columns in REQUIRED_COLUMNS.items():
            selected = ', '.join('[' + col + ']' for col in columns.split())
            cursor.execute(f'SELECT TOP (0) {selected} FROM [dbo].[{table}]')
            drain(cursor)
        connection.commit()
    except Exception:
        connection.rollback()
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true', help='Back up and upgrade SQL; without this, only report schema.')
    parser.add_argument('--application-stopped', action='store_true', help='Confirm both application backends and other writers are stopped.')
    parser.add_argument('--backup-dir', default='/var/opt/mssql/backup')
    args = parser.parse_args()
    if os.environ.get('DATABASE_BACKEND', '').lower() != 'mssql':
        parser.error('DATABASE_BACKEND must be mssql.')
    if args.apply and not args.application_stopped:
        parser.error('Stop application writes, then supply --application-stopped.')
    if not args.backup_dir.startswith('/') or '..' in PurePosixPath(args.backup_dir).parts:
        parser.error('Use an absolute backup directory inside the SQL Server container.')
    app = create_app()
    with app.app_context():
        if not args.apply:
            issues = diagnose_schema()
            print('\n'.join(issues) if issues else 'Required schema is present.')
            connection = get_db_connection()
            try:
                cursor = connection.cursor()
                cursor.execute("SELECT CASE WHEN IS_SRVROLEMEMBER('sysadmin')=1 OR IS_MEMBER('db_owner')=1 THEN 1 ELSE 0 END")
                allowed = cursor.fetchone()[0] == 1
                print('SQL upgrade permission: ' + ('available' if allowed else 'requires a SQL administrator'))
                print('No database changes made.')
            finally:
                connection.close()
            return
        connection = get_db_connection()
        try:
            connection.timeout = 300
            cursor = connection.cursor()
            cursor.execute("SELECT CASE WHEN IS_SRVROLEMEMBER('sysadmin')=1 OR IS_MEMBER('db_owner')=1 THEN 1 ELSE 0 END")
            if cursor.fetchone()[0] != 1:
                raise RuntimeError('Upgrade requires a SQL administrator (db_owner or sysadmin). Do not change the app login grants just for this command.')
            connection.rollback()
            backup_database(connection, args.backup_dir)
            apply_migrations(connection, Path(__file__).parent / 'migrations')
        finally:
            connection.close()
    print('Upgrade committed. Existing accounts and records preserved. Run the startup preflight next.')


if __name__ == '__main__':
    try:
        main()
    except pyodbc.Error:
        raise SystemExit('SQL upgrade failed; uncommitted schema changes were rolled back. Check database permissions, backup path, and schema on a restored copy. Do not start the new app yet.') from None
    except RuntimeError as error:
        raise SystemExit(str(error)) from None
