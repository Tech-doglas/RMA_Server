import os
import time
import uuid

from flask import Blueprint, request, jsonify, current_app
from app.models import get_db_connection, db_connection, save_shipping_label_image
from app.uploads import storage_component, validate_images
from app.permissions import require_action
from app.company_access import scope_sql, require_company, unrestricted
from datetime import datetime, timedelta
from werkzeug.exceptions import ClientDisconnected

return_receiving_bp = Blueprint('return', __name__)


def get_uploaded_file_size(file_storage):
    stream = file_storage.stream
    position = stream.tell()
    stream.seek(0, os.SEEK_END)
    size = stream.tell()
    stream.seek(position)
    return size

@return_receiving_bp.route('/', methods=['POST'])
def show_return_receiving_sheet():
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        filters = request.json or {}

        # Extract and normalize inputs
        tracking_number = filters.get('trackingNumber', '').strip()
        company = filters.get('company', '').strip()
        record_date = filters.get('recordDate', '').strip()
        code_value = filters.get('code', '').strip()
        recorded_list = filters.get('recorded', [])
        order_number = filters.get('orderNumber', '').strip()

        # Start query
        query = "SELECT id, TrackingNumber, Company, Code, Remark, CreationDateTime, OrderNumber, Recorded FROM RMA_return_receiving WHERE legacyId IS NOT NULL"
        scope, params = scope_sql(cursor)
        query += ' AND ' + scope

        if tracking_number:
            query += " AND TrackingNumber LIKE ?"
            params.append(f"%{tracking_number}%")

        if order_number:
            query += " AND OrderNumber LIKE ?"
            params.append(f"%{order_number}%")

        if company:
            query += " AND Company = ?"
            params.append(company)

        if code_value:
            query += " AND Code = ?"
            params.append(code_value)

        if record_date:
            date = datetime.strptime(record_date, "%Y-%m-%d").date().isoformat()
            query += " AND CONVERT(DATE, CreationDateTime) = ?"
            params.append(date)

        # Handle recorded filter
        recorded_conditions = []
        if 'recorded' in recorded_list:
            recorded_conditions.append("Recorded = ?")
            params.append(1)
        if 'not_recorded' in recorded_list:
            recorded_conditions.append("(Recorded = ? OR Recorded IS NULL)")
            params.append(0)

        if recorded_conditions:
            query += " AND (" + " OR ".join(recorded_conditions) + ")"

        query += " ORDER BY CreationDateTime DESC"
        cursor.execute(query, params)

        data = cursor.fetchall()
        columns = [column[0] for column in cursor.description]
        results = [dict(zip(columns, row)) for row in data]

        return jsonify(results)

    except Exception as e:
        current_app.logger.exception('Unable to search previous receiving records')
        return jsonify(error='Unable to load the records. Please try again.'), 500
    finally:
        if conn:
            conn.close()


@return_receiving_bp.route('/api/return/<tracking_number>', methods=['GET'])
def api_get_return_receiving_detail(tracking_number):
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        scope, params = scope_sql(cursor)
        cursor.execute(f"SELECT id, TrackingNumber, Company, Code, Remark, CreationDateTime, OrderNumber, Recorded FROM RMA_return_receiving WHERE TrackingNumber = ? AND legacyId IS NOT NULL AND {scope}", tracking_number, *params)
        row = cursor.fetchone()
        if not row:
            return jsonify({"error": "Not found"}), 404

        columns = [col[0] for col in cursor.description]
        record = dict(zip(columns, row))
        return jsonify(record)
    except Exception as e:
        current_app.logger.exception('Unable to load previous receiving record')
        return jsonify(error='Unable to load the record. Please try again.'), 500
    finally:
        if conn:
            conn.close()

@return_receiving_bp.route('/submit', methods=['POST'])
def submit_record():
    started_at = time.perf_counter()
    tracking_number = None
    images = []
    total_bytes = 0

    try:
        tracking_number = request.form.get('tracking_number')
        storage_component(tracking_number)
        company = request.form.get('company')
        require_company(company)
        code = request.form.get('code')
        remark = request.form.get('remark')
        images = validate_images(request.files.getlist('images'))
        total_bytes = sum(get_uploaded_file_size(image) for image in images)

        current_app.logger.info(
            "Return submit started | tracking=%s | images=%d | bytes=%d",
            tracking_number,
            len(images),
            total_bytes,
        )

        with db_connection() as conn:
            cursor = conn.cursor()
            if not unrestricted():
                cursor.execute('SELECT Company FROM RMA_return_receiving WITH (UPDLOCK, HOLDLOCK) WHERE TrackingNumber = ?', tracking_number)
                for row in cursor.fetchall():
                    require_company(row[0])
            cursor.execute('SELECT id FROM RMA_return_receiving WITH (UPDLOCK, HOLDLOCK) WHERE TrackingNumber = ? AND legacyId IS NOT NULL', tracking_number)
            if cursor.fetchone():
                require_action('legacy.edit')
                cursor.execute('UPDATE RMA_return_receiving SET Company = ?, Code = ?, Remark = ? WHERE TrackingNumber = ? AND legacyId IS NOT NULL', company or '', code or '', remark or '', tracking_number)
            else:
                cursor.execute('''INSERT INTO RMA_return_receiving (TrackingNumber, Company, Code, Remark, groupId, quantityKnown)
                    OUTPUT INSERTED.id VALUES (?, ?, ?, ?, ?, 0)''', tracking_number, company or '', code or '', remark or '', 'legacy_' + uuid.uuid4().hex)
                record_id = int(cursor.fetchone()[0])
                cursor.execute('UPDATE RMA_return_receiving SET legacyId = ? WHERE id = ?', record_id, record_id)
            save_started_at = time.perf_counter()
            save_shipping_label_image(images, tracking_number)
            save_duration_ms = (time.perf_counter() - save_started_at) * 1000

        total_duration_ms = (time.perf_counter() - started_at) * 1000
        current_app.logger.info(
            "Return submit completed | tracking=%s | images=%d | bytes=%d | save_ms=%.0f | total_ms=%.0f",
            tracking_number,
            len(images),
            total_bytes,
            save_duration_ms,
            total_duration_ms,
        )
        return "OK", 200
    except PermissionError as exc:
        return jsonify(error=str(exc)), 403
    except ValueError as exc:
        return jsonify(error=str(exc)), 400
    except ClientDisconnected:
        total_duration_ms = (time.perf_counter() - started_at) * 1000
        current_app.logger.warning(
            "Return submit interrupted by client | tracking=%s | images=%d | bytes=%d | total_ms=%.0f | content_length=%s",
            tracking_number,
            len(images),
            total_bytes,
            total_duration_ms,
            request.content_length,
        )
        return jsonify({'error': 'Upload interrupted before the request finished.'}), 400
    except Exception as e:
        total_duration_ms = (time.perf_counter() - started_at) * 1000
        current_app.logger.exception(
            "Return submit failed | tracking=%s | images=%d | bytes=%d | total_ms=%.0f",
            tracking_number,
            len(images),
            total_bytes,
            total_duration_ms,
        )
        return jsonify(error='Unable to save the record. Please try again.'), 500

@return_receiving_bp.route('/recorded/<tracking_number>', methods=['POST'])
def mark_recorded(tracking_number):
    try:
        with db_connection() as conn:
            cursor = conn.cursor()
            scope, params = scope_sql(cursor)
            cursor.execute(f"UPDATE RMA_return_receiving SET Recorded = 1 WHERE TrackingNumber = ? AND legacyId IS NOT NULL AND {scope}", tracking_number, *params)
        return jsonify({'message': 'Marked as recorded.'})
    except Exception as e:
        current_app.logger.exception('Unable to mark previous receiving record as recorded')
        return jsonify(error='Unable to update the record. Please try again.'), 500

@return_receiving_bp.route('/updateCode/<tracking_number>/<code>', methods=['POST'])
def update_code(tracking_number, code):
    try:
        with db_connection() as conn:
            cursor = conn.cursor()
            scope, params = scope_sql(cursor)
            cursor.execute(f"UPDATE RMA_return_receiving SET Code = ? WHERE TrackingNumber = ? AND legacyId IS NOT NULL AND {scope}", code, tracking_number, *params)
        return jsonify({'message': 'Code updated.'})
    except Exception as e:
        current_app.logger.exception('Unable to update previous receiving code')
        return jsonify(error='Unable to update the record. Please try again.'), 500


@return_receiving_bp.route('/edit/<tracking_number>', methods=['POST'])
def edit_tracking(tracking_number):
    try:
        order_number = request.form.get('OrderNumber')
        remark = request.form.get('remark')

        with db_connection() as conn:
            cursor = conn.cursor()
            scope, params = scope_sql(cursor)
            cursor.execute(f"""
                UPDATE RMA_return_receiving
                SET OrderNumber = ?, Remark = ?
                WHERE TrackingNumber = ? AND legacyId IS NOT NULL AND {scope}
            """, order_number or '', remark or '', tracking_number, *params)

        return jsonify({'message': 'Record updated successfully!'}), 200
    except Exception as e:
        current_app.logger.exception('Unable to edit previous receiving record')
        return jsonify(error='Unable to update the record. Please try again.'), 500
