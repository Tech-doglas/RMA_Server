"""Unit-based receiving workflow, adapted from the supplied Apps Script."""
import json
import os
import shutil
import uuid
from urllib.parse import quote
from datetime import date, datetime
from functools import wraps

from flask import Blueprint, current_app, jsonify, request
from werkzeug.exceptions import ServiceUnavailable
from app.models import db_connection, get_modi_rma_root
from app.uploads import save_image_files, validate_images

return_units_bp = Blueprint('return_units', __name__)
from app.receiving_store import TABLE, API_COLUMNS
from app.company_access import can_access, require_company, scope_sql, require_private_pallet


def company_options(cursor):
    cursor.execute('SELECT name FROM RMA_return_companies ORDER BY name')
    return [row[0] for row in cursor.fetchall() if can_access(row[0])]


def available_pallets(cursor):
    scope, params = scope_sql(cursor, 'u.Company')
    cursor.execute(f'''SELECT u.pallet, COUNT(*) AS total, COALESCE(s.status, 'OPEN') AS status FROM {TABLE} u
        LEFT JOIN RMA_return_pallet_status s ON LOWER(s.pallet) = LOWER(u.pallet)
        WHERE {scope} AND u.pallet <> '' AND u.shipDate IS NULL
        GROUP BY u.pallet, s.status ORDER BY u.pallet''', *params)
    return rows(cursor)


def validate_pallet_assignment(cursor, pallet, current=''):
    if not pallet or pallet.casefold() == (current or '').casefold():
        return
    require_private_pallet(cursor, pallet)
    cursor.execute('SELECT status FROM RMA_return_pallet_status WITH (UPDLOCK, HOLDLOCK) WHERE LOWER(pallet) = LOWER(?)', pallet)
    found = cursor.fetchone()
    if found and found[0] in ('LOCKED', 'FULL'):
        raise ValueError(f'Pallet {pallet} is {found[0].lower()} and cannot receive more units. Choose an open pallet.')


def bulk_options(cursor):
    cursor.execute('SELECT name FROM RMA_return_bulk_types ORDER BY name')
    names = [row[0] for row in cursor.fetchall()]
    return ['REGULAR'] + [name for name in names if name != 'REGULAR']


def validate_bulk(cursor, bulk):
    cursor.execute('SELECT name FROM RMA_return_bulk_types WHERE name = ?', bulk)
    if not cursor.fetchone():
        raise ValueError('Choose an available bulk type. An admin can manage the options.')


def api(fn):
    @wraps(fn)
    def wrapped(*args, **kwargs):
        try:
            return fn(*args, **kwargs)
        except ServiceUnavailable:
            raise
        except (ValueError, TypeError, json.JSONDecodeError) as exc:
            return jsonify(error=str(exc)), 400
        except PermissionError as exc:
            return jsonify(error=str(exc)), 403
        except Exception:
            current_app.logger.exception('Return receiving request failed')
            return jsonify(error='Unable to complete the request. Check server storage and the receiving database migration.'), 500
    return wrapped


@return_units_bp.route('/companies', methods=['GET'])
@api
def companies():
    with db_connection() as conn:
        return jsonify(companies=company_options(conn.cursor()))


def rows(cursor):
    columns = [API_COLUMNS.get(col[0], col[0]) for col in cursor.description]
    return [dict(zip(columns, row)) for row in cursor.fetchall()]


def normalized(row):
    for key, value in row.items():
        if isinstance(value, (date, datetime)):
            row[key] = value.isoformat()
    row['fileNo'] = 'sid-' + str(row['id']).zfill(4)
    row['images'] = json.loads(row.get('images') or '[]')
    row['unitImages'] = json.loads(row.get('unitImages') or '[]')
    return row


def valid_date(value, label):
    try:
        return date.fromisoformat(str(value)).isoformat()
    except ValueError:
        raise ValueError(label + ' is required and must be a valid date.')


def identifier(value):
    value = str(value).strip().lower()
    if value.startswith('sid-'):
        value = value[4:]
    if not value.isdigit() or int(value) < 1:
        raise ValueError('Enter a unit ID or File No such as sid-0001.')
    return int(value)


def get_unit(cursor, value, locked=False):
    hint = ' WITH (UPDLOCK, HOLDLOCK)' if locked else ''
    cursor.execute(f'SELECT * FROM {TABLE}{hint} WHERE id = ?', identifier(value))
    found = rows(cursor)
    return normalized(found[0]) if found and can_access(found[0].get('company', '')) else None


def label_photos(item):
    photos = list(item.get('images') or [])
    if (item.get('groupId') or '').startswith('legacy_') and item.get('tracking'):
        from app.models import get_shipping_label_image
        try:
            names = get_shipping_label_image(item['tracking'])
        except ValueError:
            names = []
        photos.extend('/images/return_receiving/' + quote(item['tracking'], safe='') + '/' + quote(name, safe='') for name in names)
    return list(dict.fromkeys(photos))


def text(payload, key, limit=255):
    value = str(payload.get(key) or '').strip()
    if len(value) > limit:
        raise ValueError(f'{key} must be at most {limit} characters.')
    return value


def required_text(payload, key, label):
    if not isinstance(payload.get(key), str) or not payload[key].strip():
        raise ValueError(label + ' is required.')
    return text(payload, key)


def save_images(files, folder):
    if not files:
        return []
    names = save_image_files(get_modi_rma_root(), 'return_units', folder, files)
    return [f'/images/return_units/{folder}/{name}' for name in names]


@return_units_bp.route('/units', methods=['GET'])
@api
def list_units():
    # Always read current data after writes; no shared stale list cache.
    with db_connection() as conn:
        cursor = conn.cursor()
        scope, params = scope_sql(cursor)
        cursor.execute(f'''SELECT id, CreationDateTime, TrackingNumber, laptop, upc, itemName, itemInfo, receivedDate,
            inspectionDate, pallet, serial, groupId, unitIndex, shipDate,
            shipBatch, bulkType, Company, quantityKnown, legacyId, Code, OrderNumber, Recorded,
            COUNT(*) OVER (PARTITION BY groupId,
                CASE WHEN NULLIF(LTRIM(RTRIM(groupId)), '') IS NULL THEN id ELSE NULL END) AS groupSize
            FROM {TABLE} WHERE {scope} ORDER BY id DESC''', *params)
        items = [normalized(row) for row in rows(cursor)]
        companies = company_options(cursor)
    return jsonify(items=items, companies=companies)


@return_units_bp.route('/units', methods=['POST'])
@api
def receive_units():
    payload = json.loads(request.form.get('payload', '{}'))
    if not isinstance(payload, dict):
        raise ValueError('Delivery information must be an object.')
    units = payload.get('units')
    if not isinstance(units, list) or not 1 <= len(units) <= 100:
        raise ValueError('Receive between 1 and 100 units per delivery.')
    if any(not isinstance(unit, dict) for unit in units):
        raise ValueError('Each unit must contain item information.')
    if type(payload.get('quantity')) is not int or payload['quantity'] != len(units):
        raise ValueError('Quantity must match the number of units in this delivery.')
    received = valid_date(payload.get('receivedDate'), 'Received date')
    tracking = required_text(payload, 'tracking', 'Tracking number')
    remark = text(payload, 'remark', 4000)
    company = required_text(payload, 'company', 'Company')
    require_company(company)
    names = [text(unit, 'laptop') for unit in units]
    upcs = [required_text(unit, 'upc', f'UPC/Item code for item {i + 1}') for i, unit in enumerate(units)]
    item_names = [text(unit, 'itemName') for unit in units]
    item_infos = [text(unit, 'itemInfo', 4000) for unit in units]
    serials = [text(unit, 'serial') for unit in units]
    serial_keys = [serial.lower() if serial else None for serial in serials]
    supplied_keys = [key for key in serial_keys if key]
    if len(supplied_keys) != len(set(supplied_keys)):
        raise ValueError('Each item must have a different serial number. Check duplicate serial numbers in this delivery.')
    shared_files = [f for f in request.files.getlist('images') if f.filename]
    unit_files = [[f for f in request.files.getlist(f'unitImages_{i}') if f.filename] for i in range(len(units))]
    for files in [shared_files] + unit_files:
        validate_images(files)
    group = 'g_' + uuid.uuid4().hex
    # UUID folders isolate separate deliveries that share a tracking number.
    try:
        with db_connection() as conn:
            cursor = conn.cursor()
            for key in sorted(supplied_keys):
                cursor.execute(f'SELECT id FROM {TABLE} WITH (UPDLOCK, HOLDLOCK) WHERE serialKey = ?', key)
                if cursor.fetchone():
                    raise ValueError('A serial number in this delivery is already assigned to another item. Check the serial numbers before saving.')
            shared = save_images(shared_files, group)
            unit_urls = [save_images(files, group + '_' + str(i + 1)) for i, files in enumerate(unit_files)]
            ids = []
            for i, name in enumerate(names):
                cursor.execute(f'''INSERT INTO {TABLE}
                    (TrackingNumber, laptop, receivedDate, Remark, images, groupId, unitIndex, unitImages, Company, bulkType, serial, serialKey, upc, itemName, itemInfo)
                    OUTPUT INSERTED.id VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
                    tracking, name, received, remark, json.dumps(shared), group,
                    i + 1, json.dumps(unit_urls[i]), company, 'REGULAR', serials[i], serial_keys[i], upcs[i], item_names[i], item_infos[i])
                ids.append(int(cursor.fetchone()[0]))
    except Exception:
        # Remove only this request's UUID folders if storage or the transaction failed.
        root = os.path.realpath(os.path.join(get_modi_rma_root(), 'images', 'return_units'))
        for folder in [group] + [group + '_' + str(i + 1) for i in range(len(units))]:
            target = os.path.realpath(os.path.join(root, folder))
            if os.path.commonpath([root, target]) == root and os.path.isdir(target):
                shutil.rmtree(target)
        raise
    return jsonify(ids=ids, fileNos=['sid-' + str(i).zfill(4) for i in ids], quantity=len(ids)), 201


@return_units_bp.route('/units/<value>', methods=['GET'])
@api
def detail(value):
    with db_connection() as conn:
        cursor = conn.cursor()
        item = get_unit(cursor, value)
        if not item:
            return jsonify(error='Return unit not found.'), 404
        item['images'] = label_photos(item)
        siblings = []
        if (item.get('groupId') or '').strip():
            cursor.execute(f'SELECT * FROM {TABLE} WHERE groupId = ? AND id <> ? ORDER BY unitIndex', item['groupId'], item['id'])
            siblings = [normalized(row) for row in rows(cursor) if can_access(row.get('company', ''))]
        item['siblings'] = siblings
        item['groupSize'] = len(siblings) + 1
        options = bulk_options(cursor)
        companies = company_options(cursor)
        open_pallets = available_pallets(cursor)
    return jsonify(item=item, bulkTypes=options, companies=companies, availablePallets=open_pallets)


@return_units_bp.route('/units/<value>/quantity', methods=['POST'])
@api
def confirm_quantity(value):
    payload = request.get_json() or {}
    quantity = payload.get('quantity')
    if type(quantity) is not int or not 1 <= quantity <= 100:
        raise ValueError('Enter a whole-number quantity from 1 to 100.')
    with db_connection() as conn:
        cursor = conn.cursor()
        item = get_unit(cursor, value, locked=True)
        if not item:
            return jsonify(error='Receiving record not found.'), 404
        if item.get('quantityKnown', 1):
            raise ValueError('This delivery already has a confirmed quantity. Refresh the record.')
        if item.get('inspectionDate') or item.get('shipDate'):
            raise ValueError('Inspect the receiving data before changing an inspected or shipped record.')
        cursor.execute(f'SELECT COUNT(*) FROM {TABLE} WITH (UPDLOCK, HOLDLOCK) WHERE groupId = ?', item['groupId'])
        if cursor.fetchone()[0] != 1:
            raise ValueError('This delivery already contains multiple records. Review it before confirming quantity.')
        ids = [item['id']]
        for index in range(2, quantity + 1):
            cursor.execute(f'''INSERT INTO {TABLE}
                (TrackingNumber, Company, Code, Remark, CreationDateTime, OrderNumber, Recorded,
                 laptop, receivedDate, images, groupId, unitIndex, bulkType, quantityKnown)
                OUTPUT INSERTED.id VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)''',
                item['tracking'], item['company'], item.get('Code', ''), item['remark'], item['timestamp'],
                item.get('OrderNumber', ''), item.get('Recorded', 0), item['laptop'], item['receivedDate'],
                json.dumps(item['images']), item['groupId'], index, item['bulkType'])
            ids.append(int(cursor.fetchone()[0]))
        cursor.execute(f'UPDATE {TABLE} SET quantityKnown = 1 WHERE id = ?', item['id'])
        from app.routes.receiving_admin import audit
        audit(cursor, 'confirm quantity', item['id'], {'previous': item, 'quantity': quantity, 'ids': ids})
    return jsonify(quantity=quantity, ids=ids, message='Delivery quantity confirmed.')


@return_units_bp.route('/units/<value>/photos', methods=['POST'])
@api
def add_unit_photos(value):
    files = [file for file in request.files.getlist('images') if file.filename]
    if not files:
        raise ValueError('Choose at least one unit photo.')
    validate_images(files)
    # Each upload owns a new folder so a failed save cannot remove older photos.
    folder = 'u_' + uuid.uuid4().hex
    try:
        with db_connection() as conn:
            cursor = conn.cursor()
            item = get_unit(cursor, value, locked=True)
            if not item:
                return jsonify(error='Return unit not found.'), 404
            if len(item['unitImages']) + len(files) > 5:
                raise ValueError('Each unit can have at most 5 photos. Existing photos are kept.')
            photos = item['unitImages'] + save_images(files, folder)
            cursor.execute(f'UPDATE {TABLE} SET unitImages = ? WHERE id = ?', json.dumps(photos), item['id'])
    except Exception:
        root = os.path.realpath(os.path.join(get_modi_rma_root(), 'images', 'return_units'))
        target = os.path.realpath(os.path.join(root, folder))
        if os.path.commonpath([root, target]) == root and os.path.isdir(target):
            shutil.rmtree(target)
        raise
    return jsonify(unitImages=photos, message=f'{len(files)} unit photo(s) added.')


@return_units_bp.route('/units/<value>/inspection', methods=['POST'])
@api
def inspect(value):
    payload = request.get_json() or {}
    inspected = valid_date(payload.get('inspectionDate'), 'Inspection date')
    serial = text(payload, 'serial')
    if not serial:
        raise ValueError('Serial number is required.')
    pallet = text(payload, 'pallet')
    remark = text(payload, 'inspectionRemark', 4000)
    with db_connection() as conn:
        cursor = conn.cursor()
        item = get_unit(cursor, value, locked=True)
        if not item:
            return jsonify(error='Return unit not found.'), 404
        if not item.get('quantityKnown', 1):
            raise ValueError('Confirm the delivery quantity before inspecting this historical receiving record.')
        if item.get('shipDate'):
            raise ValueError('This unit has already shipped; inspection cannot be changed.')
        if item.get('receivedDate') and inspected < str(item['receivedDate']):
            raise ValueError('Inspection date cannot be before the received date.')
        validate_pallet_assignment(cursor, pallet, item.get('pallet'))
        cursor.execute(f'SELECT id FROM {TABLE} WITH (UPDLOCK, HOLDLOCK) WHERE serialKey = ? AND id <> ?', serial.lower(), item['id'])
        if cursor.fetchone():
            raise ValueError('This serial number is already assigned to another unit.')
        cursor.execute(f'''UPDATE {TABLE} SET inspectionDate = ?, serial = ?, serialKey = ?,
            pallet = ?, inspectionRemark = ? WHERE id = ?''', inspected, serial, serial.lower(), pallet, remark, item['id'])
    return jsonify(message='Inspection saved.')


@return_units_bp.route('/units/<value>/bulk-type', methods=['POST'])
@api
def bulk_type(value):
    payload = request.get_json() or {}
    bulk = text(payload, 'bulkType').upper()
    if not bulk:
        raise ValueError('Choose a bulk type.')
    with db_connection() as conn:
        cursor = conn.cursor()
        validate_bulk(cursor, bulk)
        item = get_unit(cursor, value, locked=True)
        if not item:
            return jsonify(error='Return unit not found.'), 404
        # Match the script: update every unit with the same nonblank tracking.
        field, target = ('TrackingNumber', item['tracking']) if item['tracking'] else ('id', item['id'])
        scope, params = scope_sql(cursor)
        cursor.execute(f'UPDATE {TABLE} SET bulkType = ? OUTPUT INSERTED.id WHERE {field} = ? AND {scope}', bulk, target, *params)
        updated = [int(row[0]) for row in cursor.fetchall()]
    return jsonify(updatedIds=updated, updatedCount=len(updated), bulkType=bulk)


@return_units_bp.route('/pallets', methods=['GET'])
@api
def pallets():
    with db_connection() as conn:
        cursor = conn.cursor()
        scope, params = scope_sql(cursor, 'u.Company')
        cursor.execute(f'''SELECT u.pallet, COUNT(*) AS total,
            SUM(CASE WHEN u.inspectionDate IS NOT NULL AND u.shipDate IS NULL THEN 1 ELSE 0 END) AS ready,
            SUM(CASE WHEN u.shipDate IS NOT NULL THEN 1 ELSE 0 END) AS shipped,
            COALESCE(s.status, 'OPEN') AS status
            FROM {TABLE} u LEFT JOIN RMA_return_pallet_status s ON LOWER(s.pallet) = LOWER(u.pallet)
            WHERE {scope} AND u.pallet <> '' GROUP BY u.pallet, s.status ORDER BY u.pallet''', *params)
        result = rows(cursor)
    return jsonify(pallets=result)


@return_units_bp.route('/pallet-status', methods=['POST'])
@api
def change_pallet_status():
    payload = request.get_json() or {}
    pallet = text(payload, 'pallet')
    status = text(payload, 'status').upper()
    if not pallet or status not in ('OPEN', 'LOCKED', 'FULL'):
        raise ValueError('Choose a pallet and an Open, Locked, or Full status.')
    with db_connection() as conn:
        cursor = conn.cursor()
        require_private_pallet(cursor, pallet)
        scope, params = scope_sql(cursor)
        cursor.execute(f'SELECT COUNT(*) FROM {TABLE} WITH (UPDLOCK, HOLDLOCK) WHERE pallet = ? AND {scope}', pallet, *params)
        if not cursor.fetchone()[0]:
            return jsonify(error='Pallet not found. Refresh the pallet list.'), 404
        cursor.execute('SELECT pallet FROM RMA_return_pallet_status WITH (UPDLOCK, HOLDLOCK) WHERE LOWER(pallet) = LOWER(?)', pallet)
        if cursor.fetchone():
            cursor.execute('UPDATE RMA_return_pallet_status SET status = ? WHERE LOWER(pallet) = LOWER(?)', status, pallet)
        else:
            cursor.execute('INSERT INTO RMA_return_pallet_status (pallet, status) VALUES (?, ?)', pallet, status)
    return jsonify(pallet=pallet, status=status, message=f'Pallet {pallet} is now {status.lower()}.')


@return_units_bp.route('/ship', methods=['POST'])
@api
def ship():
    payload = request.get_json() or {}
    shipped_date = valid_date(payload.get('shipDate'), 'Ship date')
    pallet = text(payload, 'pallet')
    raw_ids = payload.get('unitIds') or []
    if not isinstance(raw_ids, list) or len(raw_ids) > 1000:
        raise ValueError('Select at most 1000 units.')
    ids = list(dict.fromkeys(identifier(value) for value in raw_ids))
    if not ids and not pallet:
        raise ValueError('Select a pallet or unit IDs to ship.')
    with db_connection() as conn:
        cursor = conn.cursor()
        # Serialize batch allocation and candidate checks in the same transaction.
        cursor.execute(f'''SELECT COALESCE(MAX(batchNumber), 0) FROM (
            SELECT batchNumber FROM RMA_return_shipping_batches WITH (TABLOCKX, HOLDLOCK)
            UNION SELECT shipBatchNumber AS batchNumber FROM {TABLE} WITH (TABLOCKX, HOLDLOCK)
        ) AS known_batches''')
        batch_number = int(cursor.fetchone()[0]) + 1
        batch = 'ship.' + str(batch_number).zfill(4)
        if ids:
            cursor.execute(f'SELECT * FROM {TABLE} WHERE id IN ({",".join("?" for _ in ids)})', *ids)
        else:
            cursor.execute(f'SELECT * FROM {TABLE} WHERE pallet = ?', pallet)
        candidates = [row for row in rows(cursor) if can_access(row.get('company', ''))]
        skipped = [{'id': i, 'reason': 'not found'} for i in ids if i not in {r['id'] for r in candidates}]
        eligible = []
        for item in candidates:
            reason = 'quantity not confirmed' if not item.get('quantityKnown', 1) else ('already shipped' if item['shipDate'] else ('not inspected' if not item['inspectionDate'] else ''))
            if reason:
                skipped.append({'id': item['id'], 'reason': reason})
                continue
            if shipped_date < str(item['inspectionDate']):
                raise ValueError('Ship date cannot be before the inspection date. Check the dates for all selected units.')
            eligible.append(item)
        if not eligible:
            return jsonify(error='Nothing to ship. Select inspected units that have not shipped.', skipped=skipped), 400
        # Validate every selected unit before writing any part of the shipment.
        shipped = []
        for item in eligible:
            cursor.execute(f'UPDATE {TABLE} SET shipDate = ?, shipBatch = ?, shipBatchNumber = ? WHERE id = ?',
                           shipped_date, batch, batch_number, item['id'])
            shipped.append(item['id'])
        cursor.execute('INSERT INTO RMA_return_shipping_batches (batchNumber, shipDate) VALUES (?, ?)', batch_number, shipped_date)
    return jsonify(batchId=batch, shipped=shipped, shippedCount=len(shipped), skipped=skipped)


@return_units_bp.route('/monthly-report', methods=['GET'])
@api
def monthly_report():
    with db_connection() as conn:
        cursor = conn.cursor()
        scope, params = scope_sql(cursor)
        cursor.execute(f'SELECT receivedDate, inspectionDate, shipDate, quantityKnown FROM {TABLE} WHERE {scope}', *params)
        buckets = {}
        totals = dict(received=0, inspected=0, shipped=0)
        pending_quantity = 0
        for row in cursor.fetchall():
            if len(row) > 3 and not row[3]:
                pending_quantity += 1
                continue
            for field, value in zip(totals, row):
                if value:
                    key = value.isoformat()[:7]
                    buckets.setdefault(key, dict(received=0, inspected=0, shipped=0))[field] += 1
                    totals[field] += 1
    return jsonify(months=[dict(month=key, **buckets[key]) for key in sorted(buckets, reverse=True)], totals=totals, pendingQuantity=pending_quantity)
