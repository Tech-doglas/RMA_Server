from flask import Blueprint, render_template, request, redirect
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

@non_laptop_bp.route('/', methods=['GET', 'POST'])
def show_RMA_non_laptop_sheet():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        if request.method == 'POST':
            # Get form inputs
            tracking_number = request.form.get('tracking_number', '').strip()
            name = request.form.get('name', '').strip()
            category = request.form.get('brand', '').strip()  # 'brand' is used as Category in the form
            inspection_request = request.form.get('inspection_request', '').strip()
            conditions = request.form.get('conditions', '').strip()

            # Prepare query and parameters
            query = "SELECT * FROM RMA_non_laptop_sheet WHERE 1=1"
            params = []

            # Filter by TrackingNumber
            if tracking_number:
                query += " AND TrackingNumber LIKE ?"
                params.append(f"%{tracking_number}%")

            # Filter by Name
            if name:
                query += " AND Name LIKE ?"
                params.append(f"%{name}%")

            # Filter by Category
            if category:
                query += " AND Category = ?"
                params.append(category)

            # Filter by InspectionRequest
            if inspection_request:
                inspection_list = [inspection.strip() for inspection in inspection_request.split(',') if inspection.strip()]
                db_inspections = [inspection_mapping.get(ins, ins) for ins in inspection_list]
                if db_inspections:
                    query += " AND InspectionRequest IN (" + ",".join(["?"] * len(db_inspections)) + ")"
                    params.extend(db_inspections)

            # Filter by Condition
            if conditions:
                condition_list = [condition.strip() for condition in conditions.split(',') if condition.strip()]
                db_conditions = [condition_mapping.get(condition, condition) for condition in condition_list]
                if db_conditions:
                    query += " AND Condition IN (" + ",".join(["?"] * len(db_conditions)) + ")"
                    params.extend(db_conditions)

            # Execute the query with parameters
            cursor.execute(query, params) if params else cursor.execute("SELECT * FROM RMA_non_laptop_sheet")
        else:
            cursor.execute("SELECT * FROM RMA_non_laptop_sheet")
        
        data = cursor.fetchall()
        columns = [column[0] for column in cursor.description]
        results = [dict(zip(columns, row)) for row in data]
        total_count = len(results)
        conn.close()
        return render_template('non_laptop/non_laptop.html', items=results, total_count=total_count)
    except Exception as e:
        return f"Error: {str(e)}"
    
@non_laptop_bp.route('/non_laptop_input')
def non_laptop_input():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM RMA_user")
        data = cursor.fetchall()

        conn.close()

        results = [row[0] for row in data]

        return render_template('non_laptop/non_laptop_input.html', users=results)
    except Exception as e:
        return f"Error: {str(e)}"