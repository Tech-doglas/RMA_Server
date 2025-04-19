# routes/laptop/core.py
from flask import Blueprint, request, jsonify
from app.models import get_db_connection

core_bp = Blueprint('laptop_core', __name__)

@core_bp.route('/api/laptops/search', methods=['POST'])
def api_search_laptops():
    try:
        filters = request.json

        conn = get_db_connection()
        cursor = conn.cursor()

        query = "SELECT * FROM RMA_laptop_sheet WHERE 1=1"
        params = []

        serial_number = filters.get('serialNumber', '').strip()
        if serial_number:
            query += " AND SerialNumber LIKE ?"
            params.append(f"%{serial_number}%")

        model = filters.get('model', '').strip()
        if model:
            query += " AND Model LIKE ?"
            params.append(f"%{model}%")

        brand = filters.get('brand', '')
        if isinstance(brand, list):
            brand = brand[0] if brand else ''
        brand = brand.strip() if brand else ''
        if brand:
            query += " AND Brand = ?"
            params.append(brand)

        condition_mapping = {
            'Back to New': 'N',
            'Grade A': 'A',
            'Grade B': 'B',
            'Grade C': 'C',
            'Grade F': 'F'
        }

        condition_list = filters.get('conditions', [])
        db_conditions = [condition_mapping.get(c, c) for c in condition_list]
        if db_conditions:
            placeholders = ','.join(['?'] * len(db_conditions))
            query += f" AND Condition IN ({placeholders})"
            params.extend(db_conditions)

        stock_list = filters.get('stock', [])
        stock_conditions = []

        if 'SOLD' in stock_list:
            stock_conditions.append("Stock = ?")
            params.append('SOLD')

        if 'In Stock' in stock_list:
            stock_conditions.append("(Stock IS NULL OR Stock = '')")

        if stock_conditions:
            query += " AND (" + " OR ".join(stock_conditions) + ")"

        tech_done_list = filters.get('techDone', [])
        tech_conditions = []

        if 'Done' in tech_done_list:
            tech_conditions.append("TechDone = ?")
            params.append(1)

        if 'Not yet' in tech_done_list:
            tech_conditions.append("TechDone = ?")
            params.append(0)
            tech_conditions.append("TechDone IS NULL")

        if tech_conditions:
            query += " AND (" + " OR ".join(tech_conditions) + ")"

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
