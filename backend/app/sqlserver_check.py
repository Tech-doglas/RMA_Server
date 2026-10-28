"""Read-only SQL Server schema preflight. Never installs migrations."""
import argparse
import os
import pyodbc
from werkzeug.exceptions import ServiceUnavailable

from app.models import get_db_connection


REQUIRED_COLUMNS = {
    'RMA_return_receiving': 'id TrackingNumber Company Code Remark CreationDateTime OrderNumber Recorded laptop upc itemName itemInfo receivedDate images inspectionDate pallet serial serialKey groupId unitIndex unitImages inspectionRemark shipDate shipBatch shipBatchNumber bulkType legacyId quantityKnown',
    'RMA_users': 'id username password_hash role department isActive approvalStatus',
    'RMA_departments': 'name',
    'RMA_department_permissions': 'department permission',
    'RMA_revoked_sessions': 'token_hash expires_at',
    'RMA_return_bulk_types': 'name',
    'RMA_return_companies': 'name',
    'RMA_return_pallet_status': 'pallet status',
    'RMA_return_shipping_batches': 'batchNumber shipDate',
    'RMA_return_admin_audit': 'id timestamp username action target snapshot',
    'RMA_laptop_sheet': 'ID Brand Model Spec SerialNumber OdooRef Condition Sealed Stock Remark OdooRecord LastModifiedUser TechDoneDate LastModifiedDateTime InputDate InputUser TechDone OrderNumber UpDatedSpec SKU SaleDate',
    'RMA_non_laptop_sheet': 'ID TrackingNumber Category Name OdooRef Condition ReceivedDate OdooRecord Remark LastModifiedUser LastModifiedDateTime Location InputDate OrderNumber SaleDate SKU OrderDistributed InspectionRequest ReadyToSale',
    'xie_laptop_return': 'id order_number tracking_number laptop_name customer_name remark serial_number return_id condition location tracking_received_date inspection_date delivery_date last_modified_user last_modified_datetime return_type',
}


def _connect():
    try:
        return get_db_connection()
    except ServiceUnavailable as error:
        raise RuntimeError(error.description) from None


def check_schema():
    connection = _connect()
    try:
        cursor = connection.cursor()
        for table, columns in REQUIRED_COLUMNS.items():
            # Identifiers are constants, never user input; no rows or data returned.
            selection = ', '.join(f'[{column}]' for column in columns.split())
            try:
                cursor.execute(f'SELECT TOP (0) {selection} FROM [dbo].[{table}]')
            except pyodbc.Error:
                raise RuntimeError(
                    f'SQL Server preflight failed at dbo.{table}: required columns '
                    'are missing or this login cannot read them. No migrations were run. '
                    'Review the schema and permissions before starting the new app '
                    'against production; see docs/FNOS_SQLSERVER.md.'
                ) from None
    finally:
        connection.close()


def diagnose_schema():
    """Inspect all required tables without returning records or driver details."""
    connection = _connect()
    issues = []
    try:
        cursor = connection.cursor()
        for table, columns in REQUIRED_COLUMNS.items():
            try:
                cursor.execute(f'SELECT TOP (0) * FROM [dbo].[{table}]')
            except pyodbc.Error:
                issues.append(f'dbo.{table}: table unavailable (check existence, SELECT access, and connection).')
                continue
            available = {column[0].casefold() for column in cursor.description}
            missing = [column for column in columns.split() if column.casefold() not in available]
            if missing:
                issues.append(f'dbo.{table}: missing columns: ' + ', '.join(missing))
        return issues
    finally:
        connection.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--diagnose', action='store_true',
                        help='List all missing columns and unreadable tables; never modify SQL.')
    args = parser.parse_args()
    try:
        if args.diagnose:
            if os.environ.get('DATABASE_BACKEND', '').lower() != 'mssql':
                raise RuntimeError('Schema diagnosis requires DATABASE_BACKEND=mssql.')
            from app import create_app
            with create_app().app_context():
                issues = diagnose_schema()
            print('Read-only schema report. No database changes made.')
            for issue in issues:
                print(issue)
            if issues:
                raise SystemExit(1)
            print('All required column names found. Run the regular preflight before startup.')
        else:
            # Same checks as startup, without launching an HTTP server.
            from nas_wsgi import create_nas_app
            create_nas_app()
            print('SQL Server connection and required columns verified. No database changes made.')
    except RuntimeError as error:
        raise SystemExit(str(error)) from None
