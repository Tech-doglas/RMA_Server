# app/routes/xie_routes.py
from flask import Blueprint, request, jsonify
from app.models import get_db_connection

xie_bp = Blueprint('xie', __name__)

@xie_bp.route('/api/search', methods=['POST'])
def api_search_xie_laptops():
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

        conn.close()
        return jsonify(result)

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@xie_bp.route('/api/xie-insert', methods=['POST'])
def insert_xie_item():
    try:
        data = request.json.get('data', [])
        if not data:
            return jsonify({'error': 'No data provided'}), 400

        conn = get_db_connection()
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
                item.get('user'),  # last_modified_user
                item.get('returnType')
            ))

        conn.commit()
        conn.close()

        return jsonify({'message': 'Xie items inserted successfully!'}), 200

    except Exception as e:
        print('Error inserting xie item:', e)
        return jsonify({'error': str(e)}), 500


@xie_bp.route('/api/xie-update/<int:id>', methods=['PUT'])
def update_xie_item(id):
    data = request.json
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        UPDATE xie_laptop_return SET
            order_number = ?, tracking_number = ?, location = ?, laptop_name = ?, customer_name = ?,
            remark = ?, serial_number = ?, return_id = ?, condition = ?, tracking_received_date = ?,
            inspection_date = ?, delivery_date = ?, last_modified_user = ?, last_modified_datetime = ?, return_type = ?
        WHERE id = ?
    """, (
        data['order_number'],
        data['tracking_number'],
        data['location'],
        data['laptop_name'],
        data.get('customer_name'),
        data.get('remark'),
        data['serial_number'],
        data['return_id'],
        data['condition'],
        data['tracking_received_date'],
        data.get('inspection_date'),
        data.get('delivery_date'),
        data['last_modified_user'],
        data['last_modified_datetime'],
        data['return_type'],
        id
    ))

    conn.commit()
    conn.close()

    return jsonify({"message": "Record updated successfully"})

@xie_bp.route('/api/xie-delete/<int:id>', methods=['DELETE'])
def delete_xie_item(id):
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("DELETE FROM xie_laptop_return WHERE id = ?", (id,))
    conn.commit()
    conn.close()

    return jsonify({"message": "Record deleted successfully"})
