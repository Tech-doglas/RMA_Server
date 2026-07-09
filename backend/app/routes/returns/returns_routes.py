"""
Returns (RMA) workflow — Python/Flask port of the Snowbell RMA Google Apps
Script. This is a NEW, parallel feature that reuses the RMA_return_receiving
table (extended with extra columns by
backend/migrations/2026-07_add_returns_columns.sql). Every row it owns is
tagged Source = 'RETURNS' so the existing /return feature is untouched.

Concept mapping vs. the Apps Script:
  - Google Sheet rows   -> RMA_return_receiving rows where Source = 'RETURNS'
  - Google Drive images -> local filesystem (served by the /images blueprint)
  - CacheService list    -> not needed; SQL handles the reads directly
"""

import os
import random
import re
from datetime import datetime

from flask import Blueprint, request, jsonify, current_app

from app.models import (
    db_connection,
    get_db_connection,
    get_modi_rma_root,
    save_returns_label_images,
    save_returns_unit_images,
    get_returns_image_files,
)

returns_bp = Blueprint('returns', __name__)

SOURCE = 'RETURNS'

FILENO_PREFIX = 'sid-'
FILENO_PAD = 4
SHIP_PREFIX = 'ship.'
SHIP_PAD = 4

_FILENO_RE = re.compile(r'^' + re.escape(FILENO_PREFIX) + r'(\d+)$', re.IGNORECASE)
_SHIP_RE = re.compile(r'^' + re.escape(SHIP_PREFIX) + r'(\d+)$', re.IGNORECASE)


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------
def _fmt_date(value):
    """Format a DATE/DATETIME value as 'YYYY-MM-DD', or '' when empty."""
    if value is None or value == '':
        return ''
    if isinstance(value, datetime):
        return value.strftime('%Y-%m-%d')
    if hasattr(value, 'strftime'):  # datetime.date
        return value.strftime('%Y-%m-%d')
    s = str(value)
    return s[:10] if len(s) >= 10 else s


def _iso_timestamp(value):
    if value is None or value == '':
        return ''
    if hasattr(value, 'isoformat'):
        return value.isoformat()
    return str(value)


def _s(value):
    return '' if value is None else str(value)


def _next_item_ids(cursor, count):
    cursor.execute(
        "SELECT ISNULL(MAX(ItemID), 0) FROM RMA_return_receiving WHERE Source = ?",
        (SOURCE,),
    )
    base = cursor.fetchone()[0] or 0
    return [base + i for i in range(1, count + 1)]


def _next_file_nos(cursor, count):
    cursor.execute(
        "SELECT FileNo FROM RMA_return_receiving WHERE Source = ? AND FileNo IS NOT NULL",
        (SOURCE,),
    )
    max_n = 0
    for (file_no,) in cursor.fetchall():
        m = _FILENO_RE.match(_s(file_no))
        if m:
            n = int(m.group(1))
            if n > max_n:
                max_n = n
    return [f"{FILENO_PREFIX}{str(max_n + i).zfill(FILENO_PAD)}" for i in range(1, count + 1)]


def _next_ship_batch_id(cursor):
    cursor.execute(
        "SELECT ShipBatch FROM RMA_return_receiving WHERE Source = ? AND ShipBatch IS NOT NULL",
        (SOURCE,),
    )
    max_n = 0
    for (batch,) in cursor.fetchall():
        m = _SHIP_RE.match(_s(batch))
        if m:
            n = int(m.group(1))
            if n > max_n:
                max_n = n
    return f"{SHIP_PREFIX}{str(max_n + 1).zfill(SHIP_PAD)}"


def _make_group_id(timestamp):
    def b36(num):
        if num == 0:
            return '0'
        digits = '0123456789abcdefghijklmnopqrstuvwxyz'
        out = ''
        while num > 0:
            num, rem = divmod(num, 36)
            out = digits[rem] + out
        return out

    t = b36(int(timestamp.timestamp() * 1000))
    rand = b36(random.randint(0, 36 * 36 - 1)).rjust(2, '0')
    return 'g_' + t + rand


# ------------------------------------------------------------------
# Submit — create one row per unit (Apps Script submitReturn)
# ------------------------------------------------------------------
@returns_bp.route('/submit', methods=['POST'])
def submit_return():
    try:
        tracking = (request.form.get('tracking') or '').strip()
        received_date = (request.form.get('receivedDate') or '').strip() or None
        remark = (request.form.get('remark') or '').strip()

        try:
            quantity = int(request.form.get('quantity', '1'))
        except (TypeError, ValueError):
            quantity = 1
        if quantity < 1:
            quantity = 1

        # Per-unit laptop names: unit_laptop_0, unit_laptop_1, ...
        laptop_names = []
        for i in range(quantity):
            name = (request.form.get(f'unit_laptop_{i}') or '').strip()
            if not name:
                name = (request.form.get('laptop') or '').strip()
            laptop_names.append(name)

        timestamp = datetime.now()
        group_id = _make_group_id(timestamp) if quantity > 1 else None

        with db_connection() as conn:
            cursor = conn.cursor()
            item_ids = _next_item_ids(cursor, quantity)
            file_nos = _next_file_nos(cursor, quantity)
            label_ref = item_ids[0]

            for idx in range(quantity):
                cursor.execute(
                    """
                    INSERT INTO RMA_return_receiving
                        (TrackingNumber, Remark, CreationDateTime, Source,
                         ItemID, LabelRef, LaptopName, ReceivedDate, Quantity,
                         GroupID, UnitIndex, FileNo)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        tracking,
                        remark,
                        timestamp,
                        SOURCE,
                        item_ids[idx],
                        label_ref,
                        laptop_names[idx],
                        received_date,
                        1,
                        group_id,
                        (idx + 1) if quantity > 1 else None,
                        file_nos[idx],
                    ),
                )

        # Images are saved outside the DB transaction (filesystem writes).
        label_images = [img for img in request.files.getlist('images') if img and img.filename]
        shared_count = save_returns_label_images(label_images, label_ref)

        unit_image_counts = []
        for idx in range(quantity):
            unit_imgs = [
                img for img in request.files.getlist(f'unit_images_{idx}')
                if img and img.filename
            ]
            unit_image_counts.append(save_returns_unit_images(unit_imgs, item_ids[idx]))

        current_app.logger.info(
            "Returns submit | tracking=%s | qty=%d | ids=%s",
            tracking, quantity, item_ids,
        )

        return jsonify({
            'status': 'success',
            'ids': item_ids,
            'id': item_ids[0],
            'fileNos': file_nos,
            'fileNo': file_nos[0],
            'groupId': group_id or '',
            'quantity': quantity,
            'sharedImageCount': shared_count,
            'unitImageCounts': unit_image_counts,
        })
    except Exception as e:
        current_app.logger.exception("Returns submit failed")
        return jsonify({'status': 'error', 'message': str(e)}), 500


# ------------------------------------------------------------------
# List (Apps Script getReturns / readListFromSheet_)
# ------------------------------------------------------------------
@returns_bp.route('/list', methods=['GET'])
def list_returns():
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT ItemID, CreationDateTime, TrackingNumber, LaptopName, ReceivedDate,
                   InspectionDate, Pallet, Serial, UnitIndex, GroupID,
                   ShipDate, ShipBatch, BulkType, FileNo
            FROM RMA_return_receiving
            WHERE Source = ?
            ORDER BY ItemID DESC
            """,
            (SOURCE,),
        )
        rows = cursor.fetchall()

        # groupSize per GroupID
        group_sizes = {}
        for r in rows:
            g = _s(r.GroupID)
            if g:
                group_sizes[g] = group_sizes.get(g, 0) + 1

        # One directory scan up front instead of a filesystem check per row —
        # only items that actually have an image folder get a per-folder listing.
        unit_image_root = os.path.join(get_modi_rma_root(), 'images', 'returns_unit')
        folders_with_images = set(os.listdir(unit_image_root)) if os.path.isdir(unit_image_root) else set()

        items = []
        for r in rows:
            group_id = _s(r.GroupID)
            unit_image_count = (
                len(get_returns_image_files('returns_unit', r.ItemID))
                if str(r.ItemID) in folders_with_images
                else 0
            )
            items.append({
                'id': _s(r.ItemID),
                'timestamp': _iso_timestamp(r.CreationDateTime),
                'tracking': _s(r.TrackingNumber),
                'laptop': _s(r.LaptopName),
                'receivedDate': _fmt_date(r.ReceivedDate),
                'inspectionDate': _fmt_date(r.InspectionDate),
                'pallet': _s(r.Pallet),
                'serials': _s(r.Serial).strip(),
                'unitIndex': '' if r.UnitIndex is None else _s(r.UnitIndex),
                'groupSize': group_sizes.get(group_id, '') if group_id else '',
                'unitImageCount': unit_image_count,
                'shipDate': _fmt_date(r.ShipDate),
                'shipBatch': _s(r.ShipBatch),
                'bulkType': _s(r.BulkType),
                'fileNo': _s(r.FileNo),
            })

        return jsonify({'status': 'success', 'items': items})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500
    finally:
        if conn:
            conn.close()


# ------------------------------------------------------------------
# Detail (Apps Script getReturnById)
# ------------------------------------------------------------------
def _image_urls(image_type, folder_id):
    files = get_returns_image_files(image_type, folder_id)
    return [f"/images/{image_type}/{folder_id}/{fn}" for fn in files]


@returns_bp.route('/<item_id>', methods=['GET'])
def get_return_detail(item_id):
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        row = None
        # A numeric id is an ItemID; anything else (e.g. a scanned File No
        # like "sid-0001") skips the int lookup to avoid a SQL conversion error.
        if str(item_id).isdigit():
            cursor.execute(
                "SELECT * FROM RMA_return_receiving WHERE Source = ? AND ItemID = ?",
                (SOURCE, int(item_id)),
            )
            row = cursor.fetchone()
        # Fallback: accept a File No (printed barcode).
        if not row:
            cursor.execute(
                "SELECT * FROM RMA_return_receiving WHERE Source = ? AND FileNo = ?",
                (SOURCE, str(item_id)),
            )
            row = cursor.fetchone()
        if not row:
            return jsonify({'status': 'error', 'message': 'ID not found: ' + str(item_id)}), 404

        cols = [c[0] for c in cursor.description]
        rec = dict(zip(cols, row))
        group_id = _s(rec.get('GroupID'))

        siblings = []
        if group_id:
            cursor.execute(
                """
                SELECT ItemID, FileNo, UnitIndex, LaptopName, InspectionDate
                FROM RMA_return_receiving
                WHERE Source = ? AND GroupID = ? AND ItemID <> ?
                """,
                (SOURCE, group_id, rec['ItemID']),
            )
            for s in cursor.fetchall():
                siblings.append({
                    'id': _s(s.ItemID),
                    'fileNo': _s(s.FileNo),
                    'unitIndex': '' if s.UnitIndex is None else _s(s.UnitIndex),
                    'laptop': _s(s.LaptopName),
                    'inspectionDate': _fmt_date(s.InspectionDate),
                })

            def sort_key(sib):
                try:
                    return (0, int(sib['unitIndex']))
                except (ValueError, TypeError):
                    return (1, 0)
            siblings.sort(key=sort_key)

        group_size = (len(siblings) + 1) if group_id else 1
        serial = _s(rec.get('Serial')).strip()

        item = {
            'id': _s(rec.get('ItemID')),
            'timestamp': _iso_timestamp(rec.get('CreationDateTime')),
            'tracking': _s(rec.get('TrackingNumber')),
            'laptop': _s(rec.get('LaptopName')),
            'receivedDate': _fmt_date(rec.get('ReceivedDate')),
            'remark': _s(rec.get('Remark')),
            'inspectionDate': _fmt_date(rec.get('InspectionDate')),
            'pallet': _s(rec.get('Pallet')),
            'quantity': '' if rec.get('Quantity') is None else _s(rec.get('Quantity')),
            'serial': serial,
            'serials': [serial] if serial else [],
            'images': _image_urls('returns_label', rec.get('LabelRef') or rec.get('ItemID')),
            'unitImages': _image_urls('returns_unit', rec.get('ItemID')),
            'groupId': group_id,
            'unitIndex': '' if rec.get('UnitIndex') is None else _s(rec.get('UnitIndex')),
            'groupSize': str(group_size),
            'siblings': siblings,
            'inspectionRemark': _s(rec.get('InspectionRemark')),
            'shipDate': _fmt_date(rec.get('ShipDate')),
            'shipBatch': _s(rec.get('ShipBatch')),
            'bulkType': _s(rec.get('BulkType')),
            'fileNo': _s(rec.get('FileNo')),
        }
        return jsonify({'status': 'success', 'item': item})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500
    finally:
        if conn:
            conn.close()


# ------------------------------------------------------------------
# Inspection (Apps Script updateInspection)
# ------------------------------------------------------------------
@returns_bp.route('/inspection', methods=['POST'])
def update_inspection():
    try:
        payload = request.get_json(silent=True) or {}
        inspection_date = (payload.get('inspectionDate') or '').strip()
        if not inspection_date:
            return jsonify({'status': 'error', 'message': 'Inspection date is required.'}), 400

        serial = (payload.get('serial') or '').strip()
        if not serial:
            return jsonify({'status': 'error', 'message': 'Serial number is required.'}), 400

        item_id = payload.get('id')
        pallet = (payload.get('pallet') or '').strip()
        inspection_remark = (payload.get('inspectionRemark') or '').strip()

        with db_connection() as conn:
            cursor = conn.cursor()

            cursor.execute(
                "SELECT ItemID FROM RMA_return_receiving WHERE Source = ? AND ItemID = ?",
                (SOURCE, item_id),
            )
            if not cursor.fetchone():
                return jsonify({'status': 'error', 'message': 'ID not found: ' + str(item_id)}), 404

            # Serial must be unique across other units.
            cursor.execute(
                """
                SELECT TOP 1 ItemID FROM RMA_return_receiving
                WHERE Source = ? AND ItemID <> ? AND LOWER(LTRIM(RTRIM(Serial))) = ?
                """,
                (SOURCE, item_id, serial.lower()),
            )
            dup = cursor.fetchone()
            if dup:
                return jsonify({
                    'status': 'error',
                    'message': f"Serial '{serial}' is already assigned to {dup.ItemID}.",
                }), 400

            cursor.execute(
                """
                UPDATE RMA_return_receiving
                SET InspectionDate = ?, Pallet = ?, Serial = ?, InspectionRemark = ?
                WHERE Source = ? AND ItemID = ?
                """,
                (inspection_date, pallet, serial, inspection_remark, SOURCE, item_id),
            )

        return jsonify({'status': 'success', 'id': item_id, 'serial': serial})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


# ------------------------------------------------------------------
# Bulk type (Apps Script updateBulkType) — applies to whole tracking #
# ------------------------------------------------------------------
@returns_bp.route('/bulk-type', methods=['POST'])
def update_bulk_type():
    try:
        payload = request.get_json(silent=True) or {}
        item_id = payload.get('id')
        new_value = payload.get('bulkType') or ''

        with db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT TrackingNumber FROM RMA_return_receiving WHERE Source = ? AND ItemID = ?",
                (SOURCE, item_id),
            )
            row = cursor.fetchone()
            if not row:
                return jsonify({'status': 'error', 'message': 'ID not found: ' + str(item_id)}), 404

            tracking = _s(row.TrackingNumber).strip()
            if tracking:
                cursor.execute(
                    """
                    UPDATE RMA_return_receiving SET BulkType = ?
                    WHERE Source = ? AND LTRIM(RTRIM(TrackingNumber)) = ?
                    """,
                    (new_value, SOURCE, tracking),
                )
                updated = cursor.rowcount
            else:
                cursor.execute(
                    "UPDATE RMA_return_receiving SET BulkType = ? WHERE Source = ? AND ItemID = ?",
                    (new_value, SOURCE, item_id),
                )
                updated = cursor.rowcount

        return jsonify({
            'status': 'success',
            'bulkType': new_value,
            'tracking': tracking,
            'updatedCount': updated,
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


# ------------------------------------------------------------------
# Ship-out: pallet summary (Apps Script getPalletSummary)
# ------------------------------------------------------------------
@returns_bp.route('/pallets', methods=['GET'])
def pallet_summary():
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT Pallet, InspectionDate, ShipDate
            FROM RMA_return_receiving
            WHERE Source = ? AND Pallet IS NOT NULL AND LTRIM(RTRIM(Pallet)) <> ''
            """,
            (SOURCE,),
        )
        by_pallet = {}
        for r in cursor.fetchall():
            pallet = _s(r.Pallet).strip()
            if not pallet:
                continue
            bucket = by_pallet.setdefault(pallet, {'pallet': pallet, 'total': 0, 'ready': 0, 'shipped': 0})
            bucket['total'] += 1
            if r.ShipDate:
                bucket['shipped'] += 1
            elif r.InspectionDate:
                bucket['ready'] += 1

        pallets = sorted(by_pallet.values(), key=lambda p: _natural_key(p['pallet']))
        return jsonify({'status': 'success', 'pallets': pallets})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500
    finally:
        if conn:
            conn.close()


def _natural_key(s):
    return [int(t) if t.isdigit() else t.lower() for t in re.split(r'(\d+)', str(s))]


@returns_bp.route('/pallets/<pallet>/units', methods=['GET'])
def units_by_pallet(pallet):
    conn = None
    try:
        target = (pallet or '').strip()
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT ItemID, FileNo, LaptopName, Serial, InspectionDate, ShipDate, ShipBatch
            FROM RMA_return_receiving
            WHERE Source = ? AND LTRIM(RTRIM(Pallet)) = ?
            """,
            (SOURCE, target),
        )
        units = []
        for r in cursor.fetchall():
            units.append({
                'id': _s(r.ItemID),
                'fileNo': _s(r.FileNo),
                'laptop': _s(r.LaptopName),
                'serial': _s(r.Serial),
                'inspectionDate': _fmt_date(r.InspectionDate),
                'shipDate': _fmt_date(r.ShipDate),
                'shipBatch': _s(r.ShipBatch),
            })
        units.sort(key=lambda u: _natural_key(u['id']))
        return jsonify({'status': 'success', 'units': units})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500
    finally:
        if conn:
            conn.close()


# ------------------------------------------------------------------
# Ship units (Apps Script shipUnits)
# ------------------------------------------------------------------
@returns_bp.route('/ship', methods=['POST'])
def ship_units():
    try:
        payload = request.get_json(silent=True) or {}
        ship_date = (payload.get('shipDate') or '').strip()
        if not ship_date:
            return jsonify({'status': 'error', 'message': 'Ship date is required.'}), 400

        unit_ids = [str(u) for u in (payload.get('unitIds') or [])]
        pallet_filter = (payload.get('pallet') or '').strip()

        if not pallet_filter and not unit_ids:
            return jsonify({'status': 'error', 'message': 'Specify either a pallet or unit IDs.'}), 400

        with db_connection() as conn:
            cursor = conn.cursor()

            if unit_ids:
                placeholders = ','.join(['?'] * len(unit_ids))
                cursor.execute(
                    f"""
                    SELECT ItemID, InspectionDate, ShipDate
                    FROM RMA_return_receiving
                    WHERE Source = ? AND ItemID IN ({placeholders})
                    """,
                    (SOURCE, *unit_ids),
                )
            else:
                cursor.execute(
                    """
                    SELECT ItemID, InspectionDate, ShipDate
                    FROM RMA_return_receiving
                    WHERE Source = ? AND LTRIM(RTRIM(Pallet)) = ?
                    """,
                    (SOURCE, pallet_filter),
                )

            target_ids = []
            skipped = []
            for r in cursor.fetchall():
                if r.ShipDate:
                    skipped.append({'id': _s(r.ItemID), 'reason': 'already shipped'})
                elif not r.InspectionDate:
                    skipped.append({'id': _s(r.ItemID), 'reason': 'not inspected'})
                else:
                    target_ids.append(_s(r.ItemID))

            if not target_ids:
                msg = 'Nothing to ship.'
                if skipped:
                    msg += ' Skipped: ' + ', '.join(f"{s['id']} ({s['reason']})" for s in skipped)
                return jsonify({'status': 'error', 'message': msg}), 400

            batch_id = _next_ship_batch_id(cursor)
            placeholders = ','.join(['?'] * len(target_ids))
            cursor.execute(
                f"""
                UPDATE RMA_return_receiving
                SET ShipDate = ?, ShipBatch = ?
                WHERE Source = ? AND ItemID IN ({placeholders})
                """,
                (ship_date, batch_id, SOURCE, *target_ids),
            )

        return jsonify({
            'status': 'success',
            'batchId': batch_id,
            'shipped': target_ids,
            'shippedCount': len(target_ids),
            'skipped': skipped,
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


# ------------------------------------------------------------------
# Monthly report (Apps Script getMonthlyReport)
# ------------------------------------------------------------------
@returns_bp.route('/report', methods=['GET'])
def monthly_report():
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT ReceivedDate, InspectionDate, ShipDate
            FROM RMA_return_receiving
            WHERE Source = ?
            """,
            (SOURCE,),
        )

        buckets = {}

        def bump(key, field):
            if not key:
                return
            b = buckets.setdefault(key, {'received': 0, 'inspected': 0, 'shipped': 0})
            b[field] += 1

        def month_key(value):
            d = _fmt_date(value)
            return d[:7] if len(d) >= 7 else ''

        for r in cursor.fetchall():
            bump(month_key(r.ReceivedDate), 'received')
            bump(month_key(r.InspectionDate), 'inspected')
            bump(month_key(r.ShipDate), 'shipped')

        months = [
            {'month': k, **buckets[k]}
            for k in sorted(buckets.keys(), reverse=True)
        ]
        totals = {'received': 0, 'inspected': 0, 'shipped': 0}
        for m in months:
            totals['received'] += m['received']
            totals['inspected'] += m['inspected']
            totals['shipped'] += m['shipped']

        return jsonify({'status': 'success', 'months': months, 'totals': totals})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500
    finally:
        if conn:
            conn.close()
