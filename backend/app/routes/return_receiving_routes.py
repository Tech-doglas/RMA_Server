import os
import time

from flask import Blueprint, request, redirect, url_for, jsonify, current_app
from app.models import get_db_connection, db_connection, save_shipping_label_image
from datetime import datetime, timedelta

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
        query = "SELECT * FROM RMA_return_receiving WHERE 1=1"
        params = []

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
        return jsonify({'error': str(e)}), 500
    finally:
        if conn:
            conn.close()


@return_receiving_bp.route('/api/return/<tracking_number>', methods=['GET'])
def api_get_return_receiving_detail(tracking_number):
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM RMA_return_receiving WHERE TrackingNumber = ?", tracking_number)
        row = cursor.fetchone()
        if not row:
            return jsonify({"error": "Not found"}), 404

        columns = [col[0] for col in cursor.description]
        record = dict(zip(columns, row))
        return jsonify(record)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
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
        company = request.form.get('company')
        code = request.form.get('code')
        remark = request.form.get('remark')
        images = [image for image in request.files.getlist('images') if image and image.filename]
        total_bytes = sum(get_uploaded_file_size(image) for image in images)

        current_app.logger.info(
            "Return submit started | tracking=%s | images=%d | bytes=%d",
            tracking_number,
            len(images),
            total_bytes,
        )

        with db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                IF EXISTS (SELECT 1 FROM RMA_return_receiving WHERE TrackingNumber = ?)
                BEGIN
                    UPDATE RMA_return_receiving
                    SET Company = ?, Code = ?, Remark = ?
                    WHERE TrackingNumber = ?;
                END
                ELSE
                BEGIN
                    INSERT INTO RMA_return_receiving (TrackingNumber, Company, Code, Remark)
                    VALUES (?, ?, ?, ?)
                END
            """, (tracking_number, company, code, remark, tracking_number, tracking_number, company, code, remark))
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
    except Exception as e:
        total_duration_ms = (time.perf_counter() - started_at) * 1000
        current_app.logger.exception(
            "Return submit failed | tracking=%s | images=%d | bytes=%d | total_ms=%.0f",
            tracking_number,
            len(images),
            total_bytes,
            total_duration_ms,
        )
        return jsonify({'error': str(e)}), 500

@return_receiving_bp.route('/recorded/<tracking_number>')
def mark_recorded(tracking_number):
    try:
        with db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("UPDATE RMA_return_receiving SET Recorded = 1 WHERE TrackingNumber = ?", (tracking_number,))
        return redirect(url_for('return_receiving.return_receiving_record_detail', tracking_number=tracking_number))
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@return_receiving_bp.route('/updateCode/<tracking_number>/<code>')
def update_code(tracking_number, code):
    try:
        with db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("UPDATE RMA_return_receiving SET Code = ? WHERE TrackingNumber = ?", (code, tracking_number,))
        return redirect(url_for('return_receiving.return_receiving_record_detail', tracking_number=tracking_number))
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@return_receiving_bp.route('/edit/<tracking_number>', methods=['POST'])
def edit_tracking(tracking_number):
    try:
        order_number = request.form.get('OrderNumber')
        remark = request.form.get('remark')

        with db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                UPDATE RMA_return_receiving
                SET OrderNumber = ?, Remark = ?
                WHERE TrackingNumber = ?
            """, (order_number, remark, tracking_number))

        return jsonify({'message': 'Record updated successfully!'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
