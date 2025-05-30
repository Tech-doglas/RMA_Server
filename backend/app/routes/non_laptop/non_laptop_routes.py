from flask import Blueprint, render_template, request, redirect, jsonify
from app.models import get_db_connection

from app.routes.non_laptop.non_laptop_item_routes import non_laptop_item_bp

non_laptop_bp = Blueprint('non_laptop', __name__)
non_laptop_bp.register_blueprint(non_laptop_item_bp, url_prefix='/item')

# Mapping for conditions to database values
condition_mapping = {
    'Back to New': 'N',
    'Grade A': 'A',
    'Grade B': 'B',
    'Grade C': 'C',
    'Grade F': 'F'
}

# Mapping for inspection requests to database values
inspection_mapping = {
    'Full inspection': 'A',
    'Quick Check': 'B',
    'As it': 'C'
}

@non_laptop_bp.route('/api/search', methods=['POST'])
def api_nonlaptop_search():
    try:
        filters = request.json or {}

        conn = get_db_connection()
        cursor = conn.cursor()

        query = "SELECT * FROM RMA_non_laptop_sheet WHERE 1=1"
        params = []

        tracking_number = filters.get('trackingNumber', '').strip()
        name = filters.get('name', '').strip()
        category = filters.get('category', '').strip()
        inspection_request = filters.get('inspectionRequest', [])
        conditions = filters.get('conditions', [])

        if tracking_number:
            query += " AND TrackingNumber LIKE ?"
            params.append(f"%{tracking_number}%")

        if name:
            query += " AND Name LIKE ?"
            params.append(f"%{name}%")

        if category:
            query += " AND Category = ?"
            params.append(category)

        if isinstance(inspection_request, list) and inspection_request:
            placeholders = ','.join(['?'] * len(inspection_request))
            query += f" AND InspectionRequest IN ({placeholders})"
            params.extend(inspection_request)

        if isinstance(conditions, list) and conditions:
            placeholders = ','.join(['?'] * len(conditions))
            query += f" AND Condition IN ({placeholders})"
            params.extend(conditions)

        cursor.execute(query, params)
        rows = cursor.fetchall()

        result = []
        if rows:
            columns = [col[0] for col in cursor.description]
            result = [dict(zip(columns, row)) for row in rows]

        conn.close()
        return jsonify(result)

    except Exception as e:
        print("Error in search:", str(e))
        return jsonify({'error': str(e)}), 500