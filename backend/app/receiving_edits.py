"""Audited delivery-count and photo corrections without changing printed IDs."""
import json
import os
import shutil
import uuid

from flask import request
from app.models import db_connection, get_modi_rma_root
from app.company_access import can_access
from app.permissions import require_action
from app.routes.return_units import get_unit, rows, normalized, identifier, label_photos, save_images, required_text
from app.uploads import validate_images


def change_quantity(value, payload):
    from app.routes.receiving_admin import audit
    if not isinstance(payload, dict):
        raise ValueError('Quantity information must be an object.')
    quantity = payload.get('quantity')
    if type(quantity) is not int or not 1 <= quantity <= 100:
        raise ValueError('Quantity must be a whole number from 1 to 100.')
    expected = payload.get('expectedIds')
    removed = payload.get('removeIds', [])
    if not isinstance(expected, list) or not isinstance(removed, list) or len(expected) > 100 or len(removed) > 100:
        raise ValueError('Refresh the delivery and choose the units to remove.')
    expected = [identifier(record) for record in expected]
    removed = [identifier(record) for record in removed]
    if len(expected) != len(set(expected)) or len(removed) != len(set(removed)):
        raise ValueError('Select each unit only once.')
    with db_connection() as conn:
        cursor = conn.cursor()
        # Use the same table lock as shipping before inspecting/removing units.
        cursor.execute('SELECT id FROM RMA_return_receiving WITH (TABLOCKX, HOLDLOCK) WHERE id = ?', identifier(value))
        item = get_unit(cursor, value, locked=True)
        if not item:
            raise ValueError('Return record not found.')
        if (item.get('groupId') or '').strip():
            cursor.execute('SELECT * FROM RMA_return_receiving WHERE groupId = ? ORDER BY unitIndex, id', item['groupId'])
            members = [normalized(row) for row in rows(cursor)]
        else:
            members = [item]
        if any(not can_access(member['company']) for member in members):
            raise PermissionError('This delivery includes units your department cannot manage.')
        if sorted(expected) != sorted(member['id'] for member in members):
            raise ValueError('The delivery quantity changed. Refresh the record before trying again.')
        if any(not member.get('quantityKnown', 1) for member in members) and len(members) != 1:
            raise ValueError('This historical delivery needs review before changing quantity.')
        if not item.get('quantityKnown', 1) and (item.get('inspectionDate') or item.get('shipDate')):
            raise ValueError('Review inspection and shipping before confirming a historical quantity.')
        difference = quantity - len(members)
        if difference >= 0 and removed:
            raise ValueError('Only select removals when reducing quantity.')
        if difference > 0 or not item.get('quantityKnown', 1):
            require_action('return.receive')
            if not (item.get('legacyId') is not None or (item.get('groupId') or '').startswith('legacy_')):
                for key, label in [('tracking', 'Tracking number'), ('company', 'Company'), ('upc', 'UPC/Item code')]:
                    required_text(item, key, label)
        if difference < 0:
            require_action('return.delete')
            removable = {member['id'] for member in members if member['id'] != item['id']
                         and member.get('legacyId') is None and not member.get('inspectionDate')
                         and not member.get('shipDate') and not member.get('shipBatch')}
            if len(removed) != -difference or not set(removed).issubset(removable):
                raise ValueError('Choose exactly the required number of uninspected, unshipped units. The open record and historical parent must be kept.')
        group = item['groupId'] if (item.get('groupId') or '').strip() else (
            'legacy_' + str(item['id']) if item.get('legacyId') is not None else 'g_' + uuid.uuid4().hex)
        added = []
        for member in members:
            if member['id'] in removed:
                audit(cursor, 'remove unit', member['id'], member)
                cursor.execute('DELETE FROM RMA_return_receiving WHERE id = ?', member['id'])
        kept = [member for member in members if member['id'] not in removed]
        for index, member in enumerate(kept, 1):
            if member['unitIndex'] != index or member['groupId'] != group or not member.get('quantityKnown', 1):
                audit(cursor, 'update delivery membership', member['id'], member)
                cursor.execute('UPDATE RMA_return_receiving SET unitIndex = ?, groupId = ?, quantityKnown = 1 WHERE id = ?', index, group, member['id'])
        for index in range(len(kept) + 1, quantity + 1):
            cursor.execute('''INSERT INTO RMA_return_receiving
                (TrackingNumber, Company, Code, Remark, OrderNumber, Recorded, laptop, upc, itemName, itemInfo,
                 receivedDate, images, groupId, unitIndex, bulkType, quantityKnown)
                OUTPUT INSERTED.id VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)''',
                item['tracking'], item['company'], item.get('Code', ''), item['remark'], item.get('OrderNumber', ''),
                item.get('Recorded', 0), item['laptop'], item.get('upc', ''), item.get('itemName', ''), item.get('itemInfo', ''),
                item['receivedDate'], json.dumps(label_photos(item)), group, index, item['bulkType'])
            added.append(int(cursor.fetchone()[0]))
        audit(cursor, 'change delivery quantity', item['id'], {'previousIds': expected, 'quantity': quantity, 'addedIds': added, 'removedIds': removed})
    return {'quantity': quantity, 'addedIds': added, 'removedIds': removed, 'message': 'Delivery quantity updated. Existing File Numbers were preserved.'}


def change_photos(value):
    from app.routes.receiving_admin import audit
    field = request.form.get('field')
    if field not in ('images', 'unitImages'):
        raise ValueError('Choose shipping label photos or unit photos.')
    try:
        keep = json.loads(request.form.get('keep', 'null'))
        expected = json.loads(request.form.get('expected', 'null'))
    except (ValueError, TypeError):
        raise ValueError('Refresh the photos and try again.')
    if not isinstance(keep, list) or not isinstance(expected, list) or any(not isinstance(url, str) for url in keep + expected):
        raise ValueError('Refresh the photos and try again.')
    files = [file for file in request.files.getlist('images') if file.filename]
    validate_images(files)
    folder = 'u_' + uuid.uuid4().hex
    try:
        with db_connection() as conn:
            cursor = conn.cursor()
            item = get_unit(cursor, value, locked=True)
            if not item:
                raise ValueError('Return record not found.')
            current = label_photos(item) if field == 'images' else item['unitImages']
            if expected != current:
                raise ValueError('The photos changed since you opened this page. Refresh before saving photos.')
            if len(keep) != len(set(keep)) or not set(keep).issubset(current):
                raise ValueError('Only photos already attached to this record can be kept.')
            if any(url.startswith('/images/return_receiving/') for url in set(current) - set(keep)):
                raise ValueError('Manage historical shipping labels on the Previous records page.')
            if len(keep) + len(files) > 5:
                raise ValueError('Keep at most 5 photos in each photo section.')
            photos = keep + save_images(files, folder)
            audit(cursor, 'edit photos', item['id'], {'field': field, 'previous': current, 'photos': photos})
            cursor.execute(f'UPDATE RMA_return_receiving SET {field} = ? WHERE id = ?', json.dumps(photos), item['id'])
        return {'photos': photos, 'message': 'Photos updated for this record.'}
    except Exception:
        # Only this request's new files can be removed after a failed transaction.
        root = os.path.realpath(os.path.join(get_modi_rma_root(), 'images', 'return_units'))
        target = os.path.realpath(os.path.join(root, folder))
        if os.path.commonpath([root, target]) == root and os.path.isdir(target):
            shutil.rmtree(target)
        raise
