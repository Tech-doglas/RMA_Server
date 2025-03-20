# app/routes/main_routes.py
from flask import Blueprint, render_template, request, redirect
from app.models import get_db_connection

from app.routes.laptop_item_routes import laptop_item_bp
from app.routes.laptop_sales_routes import laptop_sales_bp

laptop_bp = Blueprint('laptop', __name__)
laptop_bp.register_blueprint(laptop_item_bp, url_prefix='/item')
laptop_bp.register_blueprint(laptop_sales_bp, url_prefix='/sales')

@laptop_bp.route('/', methods=['GET', 'POST'])
def show_RMA_laptop_sheet():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        if request.method == 'POST':
            brand = request.form.get('brand', '').strip()
            model = request.form.get('model', '').strip()
            spec = request.form.get('spec', '').strip()
            serial_number = request.form.get('serial_number', '').strip()
            condition = request.form.get('condition', '').strip()
            tech_done = '1' if request.form.get('tech_done') else None  # Convert to '1' for bit
            tech_not_done = '0' if request.form.get('tech_not_done') else None  # Convert to '0' for bit
            stock_sold = 'SOLD' if request.form.get('stock_sold') else None
            stock_null = True if request.form.get('stock_null') else None
            
            query = "SELECT * FROM RMA_laptop_sheet WHERE 1=1"
            params = []
            
            if brand:
                query += " AND Brand LIKE ?"
                params.append(f"%{brand}%")
            if model:
                query += " AND Model LIKE ?"
                params.append(f"%{model}%")
            if serial_number:
                query += " AND SerialNumber LIKE ?"
                params.append(f"%{serial_number}%")
            if spec:
                query += " AND Specification LIKE ?"
                params.append(f"%{spec}%")
            if condition:
                query += " AND Condition = ?"
                params.append(condition)
            tech_conditions = []
            if tech_done is not None:
                tech_conditions.append("TechDone = ?")
                params.append(tech_done)
            if tech_not_done is not None:
                tech_conditions.append("TechDone = ? OR TechDone IS NULL")
                params.append(tech_not_done)
            if tech_conditions:
                query += " AND (" + " OR ".join(tech_conditions) + ")"
            # Handle Stock conditions
            if stock_null and not stock_sold:
                # If only "Not Sold" is checked, show only NULL or empty Stock
                query += " AND (Stock IS NULL OR Stock = ?)"
                params.append('')  # Empty string
            elif stock_sold or stock_null:
                # If "Sold" is checked, or both, combine conditions
                stock_conditions = []
                if stock_sold:
                    stock_conditions.append("Stock = ?")
                    params.append(stock_sold)
                if stock_null:
                    stock_conditions.append("(Stock IS NULL OR Stock = ?)")
                    params.append('')  # Empty string
                if stock_conditions:
                    query += " AND (" + " OR ".join(stock_conditions) + ")"
            
            cursor.execute(query, params) if params else cursor.execute("SELECT * FROM RMA_laptop_sheet")
        else:
            cursor.execute("SELECT * FROM RMA_laptop_sheet WHERE TechDone = '0'")
        
        data = cursor.fetchall()
        columns = [column[0] for column in cursor.description]
        results = [dict(zip(columns, row)) for row in data]
        
        conn.close()
        return render_template('laptop.html', items=results)
    except Exception as e:
        return f"Error: {str(e)}"

@laptop_bp.route('/laptop_input')
def laptop_input():
    try:
        return render_template('laptop_input.html')
    except Exception as e:
        return f"Error: {str(e)}"