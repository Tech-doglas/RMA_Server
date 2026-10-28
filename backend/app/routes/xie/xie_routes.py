# app/routes/xie_routes.py
from flask import Blueprint, request, jsonify, current_app
from app.models import get_db_connection, db_connection
from app.permissions import current_session
from app.routes.return_units import api

xie_bp = Blueprint('xie', __name__)

@xie_bp.route('/api/search', methods=['POST'])
def api_search_xie_laptops():
    conn = None
    try:
        filters = request.json

        conn = get_db_connection()
        cursor = conn.cursor()

        query = "SELECT * FROM xie_laptop_return WHERE 1=1"
        params = []

        order_number = filters.get('order_number', '').strip()
        if order_number:
            query += " AND order_number LIKE ?"
            params.append(f"%{order_number}%")

        tracking_number = filters.get('tracking_number', '').strip()
        if tracking_number:
            query += " AND tracking_number LIKE ?"
            params.append(f"%{tracking_number}%")

        serial_number = filters.get('serial_number', '').strip()
        if serial_number:
            query += " AND serial_number LIKE ?"
            params.append(f"%{serial_number}%")

        return_id = filters.get('return_id', '').strip()
        if return_id:
            query += " AND return_id LIKE ?"
            params.append(f"%{return_id}%")

        return_type = filters.get('return_type', [])
        if return_type:
            placeholders = ','.join(['?'] * len(return_type))
            query += f" AND return_type IN ({placeholders})"
            params.extend(return_type)

        cursor.execute(query, params)
        data = cursor.fetchall()
        result = []
        if data:
            columns = [col[0] for col in cursor.description]
            result = [dict(zip(columns, row)) for row in data]

        return jsonify(result)

    except Exception:
        current_app.logger.exception('Unable to search SnowBell records')
        return jsonify(error='Unable to load the records. Please try again.'), 500
    finally:
        if conn is not None:
            conn.close()

@xie_bp.route('/api/xie-insert', methods=['POST'])
@api
def insert_xie_item():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        raise ValueError('Enter the records to receive.')
    data = payload.get('data', [])
    if not isinstance(data, list) or not 1 <= len(data) <= 1000 or any(not isinstance(item, dict) for item in data):
        raise ValueError('Receive between 1 and 1000 records at a time.')

    with db_connection() as conn:
        cursor = conn.cursor()

        for item in data:
            cursor.execute("""
                INSERT INTO xie_laptop_return (
                    order_number, tracking_number, laptop_name,
                    customer_name, remark, serial_number, return_id,
                    condition, location, tracking_received_date,
                    inspection_date, last_modified_user, last_modified_datetime,
                    return_type
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, GETDATE(), ?)
            """, (
                item.get('orderNumber'),
                item.get('trackingNumber'),
                item.get('laptopName'),
                item.get('customerName'),
                item.get('remark'),
                item.get('serialNumber'),
                item.get('returnId'),
                item.get('condition'),
                item.get('location'),
                item.get('trackingReceivedDate'),
                item.get('inspectionDate'),
                current_session()['username'],
                item.get('returnType')
            ))

    return jsonify({'message': 'Xie items inserted successfully!'}), 200


@xie_bp.route('/api/xie-update/<int:id>', methods=['PUT'])
@api
def update_xie_item(id):
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ValueError('Enter the record details to update.')
    fields = ['order_number', 'tracking_number', 'location', 'laptop_name', 'customer_name', 'remark',
              'serial_number', 'return_id', 'condition', 'tracking_received_date', 'inspection_date', 'delivery_date', 'return_type']
    with db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM xie_laptop_return WITH (UPDLOCK, HOLDLOCK) WHERE id = ?', id)
        row = cursor.fetchone()
        if not row:
            return jsonify(error='Record not found.'), 404
        original = dict(zip([column[0] for column in cursor.description], row))
        values = [data.get(field, original[field]) for field in fields]
        cursor.execute('UPDATE xie_laptop_return SET ' + ', '.join(field + ' = ?' for field in fields) +
                       ', last_modified_user = ?, last_modified_datetime = GETDATE() WHERE id = ?',
                       *values, current_session()['username'], id)

    return jsonify({"message": "Record updated successfully"})

# @xie_bp.route('/api/xie-delete/<int:id>', methods=['DELETE'])
# def delete_xie_item(id):
#     conn = get_db_connection()
#     cursor = conn.cursor()

#     cursor.execute("DELETE FROM xie_laptop_return WHERE id = ?", (id,))
#     conn.commit()
#     conn.close()

#     return jsonify({"message": "Record deleted successfully"})

@xie_bp.route('/api/tracking/<tracking_number>', methods=['GET'])
def get_items_by_tracking(tracking_number):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT * FROM xie_laptop_return WHERE tracking_number = ?
    """, (tracking_number,))
    rows = cursor.fetchall()
    columns = [column[0] for column in cursor.description]
    conn.close()

    # Convert to dicts if needed
    items = [dict(zip(columns, row)) for row in rows]
    return jsonify(items)

@xie_bp.route('/api/return_number', methods=['GET'])
def get_return_number():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT MAX(CAST(SUBSTRING(return_id, 4, 5) AS INT)) FROM xie_laptop_return")
    max_id = cursor.fetchone()[0] or 0
    conn.close()
    return jsonify({'max_id': max_id})

@xie_bp.route('/api/request', methods=['POST'])
def api_request():
    return jsonify(error='Request submission is not configured. Contact an admin.'), 501
