"""Administrator controls for types and individual return units."""
import json
import os
import sqlite3
import uuid
from contextlib import closing
from datetime import datetime, timezone
from flask import Blueprint, current_app, g, jsonify, request
from werkzeug.security import check_password_hash, generate_password_hash
from app.admin_auth import admin_required
from app.permissions import department_names, require_action
from app.models import db_connection
from app.routes.return_units import api, bulk_options, company_options, get_unit, identifier, normalized, rows, text, valid_date, validate_bulk, validate_pallet_assignment

receiving_admin_bp = Blueprint('receiving_admin', __name__)


def audit(cursor, action, target, snapshot):
    cursor.execute('''INSERT INTO RMA_return_admin_audit (username, action, target, snapshot)
        VALUES (?, ?, ?, ?)''', g.admin_username, action, str(target), json.dumps(snapshot, default=str))


@receiving_admin_bp.route('/admin/companies', methods=['GET', 'POST', 'PATCH', 'DELETE'])
@api
@admin_required
def manage_companies():
    payload = request.get_json(silent=True) or {}
    with db_connection() as conn:
        cursor = conn.cursor()
        if request.method == 'GET':
            return jsonify(companies=company_options(cursor))
        name = text(payload, 'name')
        if not name or len(name) > 255:
            raise ValueError('Enter a company name of 1–255 characters.')
        cursor.execute('SELECT name FROM RMA_return_companies WITH (UPDLOCK, HOLDLOCK) WHERE LOWER(name) = LOWER(?)', name)
        existing = cursor.fetchone()
        if request.method == 'POST':
            if existing:
                return jsonify(error='This company already exists.'), 409
            cursor.execute('INSERT INTO RMA_return_companies (name) VALUES (?)', name)
            audit(cursor, 'add company', name, {})
        else:
            if not existing:
                return jsonify(error='Company option not found.'), 404
            name = existing[0]
            replacement = text(payload, 'replacement')
            if len(replacement) > 255 or replacement == name:
                raise ValueError('Choose a different replacement company.')
            if request.method == 'PATCH':
                if not replacement:
                    raise ValueError('Enter a company name of 1–255 characters.')
                cursor.execute('SELECT name FROM RMA_return_companies WHERE LOWER(name) = LOWER(?) AND name <> ?', replacement, name)
                if cursor.fetchone():
                    return jsonify(error='This company already exists. Use Remove to merge into it.'), 409
                cursor.execute('UPDATE RMA_return_companies SET name = ? WHERE name = ?', replacement, name)
            else:
                if replacement.casefold() == name.casefold():
                    raise ValueError('Choose a different replacement company.')
                if 'replacement' not in payload:
                    raise ValueError('Choose a replacement company or Unspecified.')
                if replacement:
                    cursor.execute('SELECT name FROM RMA_return_companies WHERE name = ?', replacement)
                    if not cursor.fetchone():
                        raise ValueError('Choose an available replacement company.')
                cursor.execute('DELETE FROM RMA_return_companies WHERE name = ?', name)
            cursor.execute('UPDATE RMA_return_units SET company = ? WHERE company = ?', replacement, name)
            audit(cursor, 'rename company' if request.method == 'PATCH' else 'remove company', name, {'replacement': replacement})
        options = company_options(cursor)
    return jsonify(companies=options, message='Company options and existing records updated.')


def type_name(payload, key='name'):
    name = text(payload, key).upper()
    if not name or len(name) > 255:
        raise ValueError('Enter a type name of 1–255 characters.')
    return name


@receiving_admin_bp.route('/admin/types', methods=['GET', 'POST', 'PATCH', 'DELETE'])
@api
@admin_required
def manage_types():
    payload = request.get_json(silent=True) or {}
    with db_connection() as conn:
        cursor = conn.cursor()
        if request.method == 'GET':
            return jsonify(bulkTypes=bulk_options(cursor))
        name = type_name(payload)
        if request.method == 'POST':
            cursor.execute('SELECT name FROM RMA_return_bulk_types WITH (UPDLOCK, HOLDLOCK) WHERE name = ?', name)
            if cursor.fetchone():
                return jsonify(error='This bulk type already exists.'), 409
            cursor.execute('INSERT INTO RMA_return_bulk_types (name) VALUES (?)', name)
            audit(cursor, 'add type', name, {})
        else:
            if name == 'REGULAR':
                raise ValueError('REGULAR is the default type and must remain available.')
            validate_bulk(cursor, name)
            replacement = type_name(payload, 'replacement')
            if replacement == name:
                raise ValueError('Choose a different replacement type.')
            if request.method == 'PATCH':
                cursor.execute('SELECT name FROM RMA_return_bulk_types WITH (UPDLOCK, HOLDLOCK) WHERE name = ?', replacement)
                if cursor.fetchone():
                    return jsonify(error='This bulk type already exists. Use Remove to merge into it.'), 409
                cursor.execute('UPDATE RMA_return_bulk_types SET name = ? WHERE name = ?', replacement, name)
            else:
                validate_bulk(cursor, replacement)
                cursor.execute('DELETE FROM RMA_return_bulk_types WHERE name = ?', name)
            cursor.execute('UPDATE RMA_return_units SET bulkType = ? WHERE bulkType = ?', replacement, name)
            audit(cursor, 'rename type' if request.method == 'PATCH' else 'remove type', name, {'replacement': replacement})
        options = bulk_options(cursor)
    return jsonify(bulkTypes=options, message='Bulk types updated.')


@receiving_admin_bp.route('/admin/units/<value>', methods=['PATCH', 'DELETE'])
@api
def manage_unit(value):
    payload = request.get_json() or {}
    with db_connection() as conn:
        cursor = conn.cursor()
        item = get_unit(cursor, value, locked=True)
        if not item:
            return jsonify(error='Return unit not found.'), 404
        if request.method == 'DELETE':
            if payload.get('confirmFileNo') != item['fileNo']:
                raise ValueError('Enter the File Number to confirm removal.')
            audit(cursor, 'remove unit', item['id'], item)
            cursor.execute('DELETE FROM RMA_return_units WHERE id = ?', item['id'])
            return jsonify(message='Return record removed.')
        updated = dict(item)
        for field in ['tracking', 'laptop', 'company', 'pallet', 'serial']:
            if field in payload:
                updated[field] = text(payload, field)
        for field in ['remark', 'inspectionRemark']:
            if field in payload:
                updated[field] = text(payload, field, 4000)
        for field in ['receivedDate', 'inspectionDate', 'shipDate']:
            if field in payload:
                updated[field] = valid_date(payload[field], field) if payload[field] else None
        if not updated.get('receivedDate'):
            raise ValueError('Received date is required.')
        if updated.get('inspectionDate') and not updated.get('serial'):
            raise ValueError('An inspected unit requires a serial number.')
        if updated.get('shipDate') and (not updated.get('inspectionDate') or not item.get('shipBatch')):
            raise ValueError('A shipped unit requires inspection and an existing shipping batch. Use Ship out for new shipments.')
        if 'bulkType' in payload:
            updated['bulkType'] = type_name(payload, 'bulkType')
        validate_bulk(cursor, updated['bulkType'])
        if updated['bulkType'] != item['bulkType']:
            require_action('return.classify')
        if any(updated.get(field) != item.get(field) for field in ('pallet', 'serial', 'inspectionDate', 'inspectionRemark')):
            require_action('return.inspect')
        if updated.get('shipDate') != item.get('shipDate'):
            require_action('return.ship')
        if item.get('shipDate') and updated.get('shipDate') and any(updated.get(field) != item.get(field) for field in ('pallet', 'serial', 'inspectionDate', 'inspectionRemark')):
            raise ValueError('This unit has already shipped. Clear its ship date before changing the inspection or pallet.')
        validate_pallet_assignment(cursor, updated['pallet'], item.get('pallet'))
        if updated.get('serial'):
            cursor.execute('SELECT id FROM RMA_return_units WITH (UPDLOCK, HOLDLOCK) WHERE serialKey = ? AND id <> ?', updated['serial'].lower(), item['id'])
            if cursor.fetchone():
                raise ValueError('This serial number is already assigned to another unit.')
        audit(cursor, 'edit unit', item['id'], item)
        cursor.execute('''UPDATE RMA_return_units SET tracking = ?, laptop = ?, company = ?,
            receivedDate = ?, remark = ?, inspectionDate = ?, serial = ?, serialKey = ?,
            pallet = ?, inspectionRemark = ?, shipDate = ?, shipBatch = ?, shipBatchNumber = ? WHERE id = ?''',
            updated['tracking'], updated['laptop'], updated['company'], updated['receivedDate'],
            updated['remark'], updated['inspectionDate'], updated['serial'], updated['serial'].lower() or None,
            updated['pallet'], updated['inspectionRemark'], updated['shipDate'],
            item['shipBatch'] if updated['shipDate'] else '', item['shipBatchNumber'] if updated['shipDate'] else None, item['id'])
        # Classification remains a tracking-group operation, even in admin edits.
        field, target = ('tracking', updated['tracking']) if updated['tracking'] else ('id', item['id'])
        cursor.execute(f'SELECT * FROM RMA_return_units WHERE {field} = ? AND id <> ? AND bulkType <> ?', target, item['id'], updated['bulkType'])
        siblings = rows(cursor)
        if siblings:
            require_action('return.classify')
        for sibling in siblings:
            audit(cursor, 'bulk type', sibling['id'], normalized(sibling))
        cursor.execute(f'UPDATE RMA_return_units SET bulkType = ? WHERE {field} = ?', updated['bulkType'], target)
    return jsonify(message='Return record updated.')


@receiving_admin_bp.route('/admin/password', methods=['POST'])
@api
@admin_required
def change_password():
    payload = request.get_json() or {}
    current_password = str(payload.get('currentPassword') or '')
    new_password = str(payload.get('newPassword') or '')
    if len(new_password) < 12 or len(new_password) > 255:
        raise ValueError('Use a new password with 12–255 characters.')
    with db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT password_hash FROM RMA_users WHERE username = ?', g.admin_username)
        if not check_password_hash(cursor.fetchone()[0], current_password):
            return jsonify(error='Current password is incorrect.'), 400
        cursor.execute('UPDATE RMA_users SET password_hash = ? WHERE username = ?', generate_password_hash(new_password), g.admin_username)
    return jsonify(message='Password changed. Please log in again.')


def pagination():
    try:
        page = max(1, int(request.args.get('page', 1)))
        size = min(100, max(1, int(request.args.get('pageSize', 25))))
    except ValueError:
        raise ValueError('Page and page size must be numbers.')
    return page, size


def page_rows(cursor, query, params, order):
    page, size = pagination()
    cursor.execute(f'SELECT COUNT(*) FROM ({query}) AS counted', *params)
    total = cursor.fetchone()[0]
    cursor.execute(f'''SELECT * FROM (SELECT source.*, ROW_NUMBER() OVER (ORDER BY {order}) AS rowNumber
        FROM ({query}) AS source) AS numbered WHERE rowNumber BETWEEN ? AND ? ORDER BY rowNumber''',
        *params, (page - 1) * size + 1, page * size)
    result = rows(cursor)
    for row in result:
        row.pop('rowNumber', None)
    return dict(items=result, total=total, page=page, pageSize=size)


@receiving_admin_bp.route('/admin/overview', methods=['GET'])
@api
@admin_required
def overview():
    with db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('''SELECT COUNT(*) AS received,
            COALESCE(SUM(CASE WHEN inspectionDate IS NOT NULL THEN 1 ELSE 0 END), 0) AS inspected,
            COALESCE(SUM(CASE WHEN inspectionDate IS NULL THEN 1 ELSE 0 END), 0) AS awaitingInspection,
            COALESCE(SUM(CASE WHEN inspectionDate IS NOT NULL AND shipDate IS NULL THEN 1 ELSE 0 END), 0) AS readyToShip,
            COALESCE(SUM(CASE WHEN shipDate IS NOT NULL THEN 1 ELSE 0 END), 0) AS shipped,
            COUNT(DISTINCT CASE WHEN pallet <> '' THEN pallet END) AS pallets FROM RMA_return_units''')
        totals = rows(cursor)[0]
        cursor.execute("SELECT COUNT(*) FROM RMA_users WHERE isActive = 1 AND approvalStatus = 'approved'")
        totals['activeAccounts'] = cursor.fetchone()[0]
        cursor.execute("SELECT COUNT(*) FROM RMA_users WHERE approvalStatus = 'pending'")
        totals['pendingRegistrations'] = cursor.fetchone()[0]
        cursor.execute('''SELECT COUNT(DISTINCT target) FROM RMA_return_admin_audit AS a WHERE action = 'remove unit'
            AND NOT EXISTS (SELECT 1 FROM RMA_return_units AS u WHERE u.id = a.target)''')
        totals['removedRecords'] = cursor.fetchone()[0]
        options = bulk_options(cursor)
        cursor.execute('SELECT bulkType, COUNT(*) AS total FROM RMA_return_units GROUP BY bulkType')
        usage = rows(cursor)
    return jsonify(totals=totals, bulkTypes=options, typeUsage=usage, database=current_app.config['DATABASE_BACKEND'])


@receiving_admin_bp.route('/admin/records', methods=['GET'])
@api
def search_records():
    conditions, params = [], []
    query = request.args.get('q', '').strip()[:255]
    if query:
        try:
            unit_id = identifier(query)
        except ValueError:
            unit_id = -1
        conditions.append('(id = ? OR tracking LIKE ? OR laptop LIKE ? OR serial LIKE ? OR pallet LIKE ? OR company LIKE ?)')
        params.extend([unit_id] + ['%' + query + '%'] * 5)
    statuses = {'awaiting': 'inspectionDate IS NULL', 'ready': 'inspectionDate IS NOT NULL AND shipDate IS NULL', 'shipped': 'shipDate IS NOT NULL'}
    status = request.args.get('status', '')
    if status:
        if status not in statuses:
            raise ValueError('Choose a valid status.')
        conditions.append(statuses[status])
    for field in ['bulkType', 'company', 'pallet']:
        if request.args.get(field):
            conditions.append(field + ' = ?')
            params.append(request.args[field][:255])
    for arg, operator in [('from', '>='), ('to', '<=')]:
        if request.args.get(arg):
            conditions.append('receivedDate ' + operator + ' ?')
            params.append(valid_date(request.args[arg], arg))
    with db_connection() as conn:
        cursor = conn.cursor()
        result = page_rows(cursor, 'SELECT * FROM RMA_return_units' + (' WHERE ' + ' AND '.join(conditions) if conditions else ''), params, 'id DESC')
        result['items'] = [normalized(item) for item in result['items']]
        result['companies'] = company_options(cursor)
    return jsonify(result)


@receiving_admin_bp.route('/admin/bulk', methods=['POST'])
@api
def bulk_update():
    payload = request.get_json() or {}
    raw_ids = payload.get('unitIds')
    if not isinstance(raw_ids, list) or not raw_ids or len(raw_ids) > 100:
        raise ValueError('Select 1–100 records.')
    ids = list(dict.fromkeys(identifier(value) for value in raw_ids))
    action = payload.get('action')
    if action not in ('type', 'pallet', 'remove'):
        raise ValueError('Choose a bulk action.')
    if action == 'remove' and payload.get('confirmation') != 'REMOVE ' + str(len(ids)):
        raise ValueError('Type REMOVE followed by the selected record count to confirm.')
    with db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(f'SELECT * FROM RMA_return_units WITH (UPDLOCK, HOLDLOCK) WHERE id IN ({",".join("?" for _ in ids)})', *ids)
        items = [normalized(row) for row in rows(cursor)]
        if len(items) != len(ids):
            raise ValueError('Some selected records no longer exist. Refresh the list.')
        value = type_name(payload, 'value') if action == 'type' else text(payload, 'value')
        if action == 'type':
            validate_bulk(cursor, value)
            affected = {}
            for item in items:
                if item['tracking']:
                    cursor.execute('SELECT * FROM RMA_return_units WITH (UPDLOCK, HOLDLOCK) WHERE tracking = ?', item['tracking'])
                    for match in rows(cursor):
                        affected[match['id']] = normalized(match)
                else:
                    affected[item['id']] = item
            items = list(affected.values())
        if action == 'pallet' and any(item['shipDate'] for item in items):
            raise ValueError('Shipped units cannot be moved to another pallet. Deselect them first.')
        if action == 'pallet':
            for item in items:
                validate_pallet_assignment(cursor, value, item.get('pallet'))
        for item in items:
            audit(cursor, 'remove unit' if action == 'remove' else 'bulk ' + action, item['id'], item)
            if action == 'remove':
                cursor.execute('DELETE FROM RMA_return_units WHERE id = ?', item['id'])
            else:
                field = 'bulkType' if action == 'type' else 'pallet'
                cursor.execute(f'UPDATE RMA_return_units SET {field} = ? WHERE id = ?', value, item['id'])
    return jsonify(message=f'{len(items)} record(s) updated.', updatedCount=len(items))


@receiving_admin_bp.route('/admin/users', methods=['GET', 'POST', 'PATCH'])
@api
@admin_required
def accounts():
    payload = request.get_json(silent=True) or {}
    with db_connection() as conn:
        cursor = conn.cursor()
        if request.method != 'GET':
            username = text(payload, 'username')
            role, department = text(payload, 'role'), text(payload, 'department')
            active = payload.get('isActive', True)
            password = str(payload.get('password') or '')
            if not username or not department or role not in ('normal', 'manager', 'admin') or not isinstance(active, bool):
                raise ValueError('Enter username, department, a valid role and account status.')
            if department not in department_names(cursor):
                raise ValueError('Choose an available department. Add departments in Departments & permissions.')
            if username.casefold() == 'admin' and (role != 'admin' or not active):
                raise ValueError('The admin account has a fixed Admin role and Active status. These cannot be changed.')
            if (password or request.method == 'POST') and not 12 <= len(password) <= 255:
                raise ValueError('Passwords must contain 12–255 characters.')
            cursor.execute('SELECT username, role, department, isActive, approvalStatus FROM RMA_users WITH (UPDLOCK, HOLDLOCK) WHERE username = ?', username)
            found = rows(cursor)
            if request.method == 'POST':
                if found:
                    return jsonify(error='Username already exists.'), 409
                cursor.execute('INSERT INTO RMA_users (username, password_hash, role, department, isActive) VALUES (?, ?, ?, ?, ?)',
                               username, generate_password_hash(password), role, department, int(active))
                audit(cursor, 'create account', username, {'role': role, 'department': department})
            else:
                if not found:
                    return jsonify(error='Account not found.'), 404
                if username.casefold() == g.admin_username.casefold() and (not active or role != 'admin'):
                    raise ValueError('You cannot disable or demote your own admin account.')
                if found[0]['role'] == 'admin' and found[0]['isActive'] and (role != 'admin' or not active):
                    cursor.execute("SELECT COUNT(*) FROM RMA_users WITH (TABLOCKX, HOLDLOCK) WHERE role = 'admin' AND isActive = 1 AND approvalStatus = 'approved'")
                    if cursor.fetchone()[0] <= 1:
                        raise ValueError('At least one active admin must remain.')
                cursor.execute('UPDATE RMA_users SET role = ?, department = ?, isActive = ? WHERE username = ?', role, department, int(active), username)
                if password:
                    cursor.execute('UPDATE RMA_users SET password_hash = ? WHERE username = ?', generate_password_hash(password), username)
                audit(cursor, 'update account', username, found[0])
        cursor.execute('SELECT username, role, department, isActive, approvalStatus FROM RMA_users ORDER BY username')
        result = rows(cursor)
    return jsonify(users=result, message='Accounts updated.' if request.method != 'GET' else '')


@receiving_admin_bp.route('/admin/users/approval', methods=['POST'])
@api
@admin_required
def approve_registration():
    payload = request.get_json() or {}
    username = text(payload, 'username')
    decision = payload.get('decision')
    if not username or decision not in ('approve', 'reject'):
        raise ValueError('Choose an account and approve or reject its registration.')
    with db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT username, role, department, isActive, approvalStatus FROM RMA_users WITH (UPDLOCK, HOLDLOCK) WHERE username = ?', username)
        found = rows(cursor)
        if not found:
            return jsonify(error='Account not found.'), 404
        if found[0]['approvalStatus'] == 'approved':
            raise ValueError('This account is already approved. Use account status to disable access.')
        status = 'approved' if decision == 'approve' else 'rejected'
        cursor.execute('UPDATE RMA_users SET approvalStatus = ? WHERE username = ?', status, username)
        audit(cursor, 'approve registration' if decision == 'approve' else 'reject registration', username, found[0])
        cursor.execute('SELECT username, role, department, isActive, approvalStatus FROM RMA_users ORDER BY username')
        result = rows(cursor)
    return jsonify(users=result, message='Registration approved.' if decision == 'approve' else 'Registration rejected.')


@receiving_admin_bp.route('/admin/history', methods=['GET'])
@api
@admin_required
def history():
    conditions, params = [], []
    for field in ['username', 'action', 'target']:
        if request.args.get(field):
            conditions.append(field + ' = ?')
            params.append(request.args[field][:255])
    with db_connection() as conn:
        cursor = conn.cursor()
        result = page_rows(cursor, 'SELECT * FROM RMA_return_admin_audit' + (' WHERE ' + ' AND '.join(conditions) if conditions else ''), params, 'id DESC')
        for item in result['items']:
            item['timestamp'] = str(item['timestamp'])
            item['snapshot'] = json.loads(item['snapshot'])
    return jsonify(result)


@receiving_admin_bp.route('/admin/trash', methods=['GET'])
@api
def removed_records():
    query = '''SELECT a.* FROM RMA_return_admin_audit AS a WHERE a.action = 'remove unit'
        AND NOT EXISTS (SELECT 1 FROM RMA_return_units AS u WHERE u.id = a.target)
        AND a.id = (SELECT MAX(b.id) FROM RMA_return_admin_audit AS b WHERE b.action = 'remove unit' AND b.target = a.target)'''
    with db_connection() as conn:
        result = page_rows(conn.cursor(), query, [], 'id DESC')
        for item in result['items']:
            item['timestamp'] = str(item['timestamp'])
            item['snapshot'] = json.loads(item['snapshot'])
    return jsonify(result)


@receiving_admin_bp.route('/admin/restore/<value>', methods=['POST'])
@api
def restore_record(value):
    with db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT target, snapshot FROM RMA_return_admin_audit WITH (UPDLOCK, HOLDLOCK) WHERE id = ? AND action = 'remove unit'", identifier(value))
        event = cursor.fetchone()
        if not event:
            return jsonify(error='Removed record not found.'), 404
        item = json.loads(event[1])
        cursor.execute("SELECT MAX(id) FROM RMA_return_admin_audit WHERE action = 'remove unit' AND target = ?", event[0])
        if cursor.fetchone()[0] != identifier(value):
            raise ValueError('Restore the most recently removed version of this record.')
        if get_unit(cursor, item['id'], locked=True):
            raise ValueError('This record is already present.')
        if item.get('serialKey'):
            cursor.execute('SELECT id FROM RMA_return_units WHERE serialKey = ?', item['serialKey'])
            if cursor.fetchone():
                raise ValueError('This serial number is now assigned to another unit. Correct that unit before restoring.')
        cursor.execute('SELECT name FROM RMA_return_bulk_types WHERE name = ?', item['bulkType'])
        if not cursor.fetchone():
            item['bulkType'] = 'REGULAR'
        columns = ['id', 'timestamp', 'tracking', 'laptop', 'receivedDate', 'remark', 'images', 'inspectionDate', 'pallet',
                   'serial', 'serialKey', 'groupId', 'unitIndex', 'unitImages', 'inspectionRemark', 'shipDate', 'shipBatch',
                   'shipBatchNumber', 'bulkType', 'company']
        values = [json.dumps(item[field]) if field in ('images', 'unitImages') else item.get(field) for field in columns]
        sql_server = current_app.config['DATABASE_BACKEND'] == 'mssql'
        if sql_server:
            cursor.execute('SET IDENTITY_INSERT RMA_return_units ON')
        try:
            cursor.execute(f'INSERT INTO RMA_return_units ({",".join(columns)}) VALUES ({",".join("?" for _ in columns)})', *values)
        finally:
            if sql_server:
                cursor.execute('SET IDENTITY_INSERT RMA_return_units OFF')
        audit(cursor, 'restore unit', item['id'], {'removedEventId': identifier(value)})
    return jsonify(message='Record restored with its original ID and File Number.', fileNo=item['fileNo'])


@receiving_admin_bp.route('/admin/export', methods=['GET'])
@api
def export_records():
    with db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM RMA_return_units ORDER BY id')
        units = [normalized(row) for row in rows(cursor)]
        options = bulk_options(cursor)
        audit(cursor, 'export returns', 'all', {'count': len(units)})
        companies = company_options(cursor)
    return jsonify(version=1, exportedAt=datetime.now(timezone.utc).isoformat(), bulkTypes=options, companies=companies, units=units)


@receiving_admin_bp.route('/admin/backup', methods=['POST'])
@api
@admin_required
def backup_database():
    if current_app.config['DATABASE_BACKEND'] != 'sqlite':
        raise ValueError('Database backups on this page are available in local SQLite mode. Use SQL Server backup tools for SQL Server.')
    directory = os.path.join(os.path.dirname(current_app.config['SQLITE_PATH']), 'backups')
    os.makedirs(directory, exist_ok=True)
    name = 'admin-backup-' + datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S') + '-' + uuid.uuid4().hex[:8] + '.sqlite3'
    with closing(sqlite3.connect(current_app.config['SQLITE_PATH'])) as source, closing(sqlite3.connect(os.path.join(directory, name))) as destination:
        source.backup(destination)
    with db_connection() as conn:
        audit(conn.cursor(), 'database backup', name, {})
    return jsonify(message='Database backup saved. Photos remain in the storage folder; back up that folder too.', filename=name)
