from flask import Blueprint, request, jsonify, current_app
from app.models import get_db_connection, db_connection
from app.permissions import current_session

from app.routes.non_laptop.non_laptop_item_routes import non_laptop_item_bp
from app.routes.non_laptop.non_laptop_sales_routes import non_laptop_sales_bp

non_laptop_bp = Blueprint('non_laptop', __name__)
non_laptop_bp.register_blueprint(non_laptop_item_bp, url_prefix='/item')
non_laptop_bp.register_blueprint(non_laptop_sales_bp, url_prefix='/sales')

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
    'Full inspection': 'A'
}

@non_laptop_bp.route('/api/search', methods=['POST'])
def api_nonlaptop_search():
    conn = None
    try:
        filters = request.json or {}

        conn = get_db_connection()
        cursor = conn.cursor()

        query = "SELECT * FROM RMA_non_laptop_sheet WHERE 1=1"
        params = []

        tracking_number = filters.get('trackingNumber', '').strip()
        name = filters.get('name', '').strip()
        category = filters.get('category', [])
        inspection_request = filters.get('inspectionRequest', [])
        conditions = filters.get('conditions', [])
        readyToSale = filters.get('readyToSale', [])
        has_order_number = filters.get('hasOrderNumber', [])

        if tracking_number:
            query += " AND TrackingNumber LIKE ?"
            params.append(f"%{tracking_number}%")

        if name:
            query += " AND Name LIKE ?"
            params.append(f"%{name}%")

        if isinstance(category, list) and category:
            placeholders = ','.join(['?'] * len(category))
            query += f" AND Category IN ({placeholders})"
            params.extend(category)

        if isinstance(inspection_request, list) and inspection_request:
            placeholders = ','.join(['?'] * len(inspection_request))
            query += f" AND InspectionRequest IN ({placeholders})"
            params.extend(inspection_request)

        if isinstance(conditions, list) and conditions:
            placeholders = ','.join(['?'] * len(conditions))
            query += f" AND Condition IN ({placeholders})"
            params.extend(conditions)

        if 'Ready' in readyToSale and not 'Not yet' in readyToSale:
            query += f" AND ReadyToSale = ?"
            params.append(1)

        if 'Not yet' in readyToSale and not 'Ready' in readyToSale:
            query += f" AND (ReadyToSale = ? OR ReadyToSale IS NULL)"
            params.append(0)
            
        if 'Yes' in has_order_number:
            query += " AND (OrderNumber IS NOT NULL AND OrderNumber <> '')"

        cursor.execute(query, params)
        rows = cursor.fetchall()

        result = []
        if rows:
            columns = [col[0] for col in cursor.description]
            result = [dict(zip(columns, row)) for row in rows]

        return jsonify(result)

    except Exception:
        current_app.logger.exception('Unable to search non-PC inventory')
        return jsonify(error='Unable to load inventory. Please try again.'), 500
    finally:
        if conn is not None:
            conn.close()


def update_selected_status(column, value):
    try:
        data = request.get_json(silent=True)
        ids = data.get('ids') if isinstance(data, dict) else None
        if not isinstance(ids, list) or not 1 <= len(ids) <= 1000:
            raise ValueError('Select between 1 and 1000 items.')
        validated = []
        for item_id in ids:
            if isinstance(item_id, bool) or not isinstance(item_id, (int, str)) or len(str(item_id)) > 10 or not str(item_id).isascii() or not str(item_id).isdigit():
                raise ValueError('Every selected item must have a positive whole-number ID.')
            number = int(item_id)
            if not 1 <= number <= 2147483647:
                raise ValueError('Every selected item must have a valid positive ID.')
            validated.append(number)
        validated = list(dict.fromkeys(validated))
        # Column names come only from the two fixed endpoint calls below.
        with db_connection() as conn:
            cursor = conn.cursor()
            placeholders = ','.join('?' for _ in validated)
            cursor.execute(f'UPDATE RMA_non_laptop_sheet SET {column} = ?, LastModifiedUser = ?, LastModifiedDateTime = GETDATE() WHERE ID IN ({placeholders})',
                           value, current_session()['username'], *validated)
        return jsonify(message='Updated successfully')
    except ValueError as exc:
        return jsonify(error=str(exc)), 400
    except Exception:
        current_app.logger.exception('Unable to update non-PC item status')
        return jsonify(error='Unable to update the selected items. Please try again.'), 500

@non_laptop_bp.route('/api/updaterequest', methods=['POST'])
def api_update_request():
    return update_selected_status('InspectionRequest', 'A')
    
@non_laptop_bp.route('/api/get_tracking_number', methods=['get'])
def api_tracking_number():
    try:
        with db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT MAX(CAST(RIGHT(TrackingNumber, 5) AS INT)) AS MaxNumber FROM RMA_non_laptop_sheet WHERE TrackingNumber LIKE 'No Tracking - %'")
            row = cursor.fetchone()
        max_number = row[0] if row and row[0] is not None else 0
        return jsonify(max_number)
    except Exception:
        current_app.logger.exception('Unable to allocate non-PC tracking number')
        return jsonify(error='Unable to load the next tracking number. Please try again.'), 500

@non_laptop_bp.route('/api/saleready', methods=['POST'])
def api_sale_ready():
    return update_selected_status('ReadyToSale', 1)
