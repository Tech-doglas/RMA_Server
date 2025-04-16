# app/routes/main_routes.py
from flask import Blueprint, render_template, request, jsonify, make_response
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from io import BytesIO
from collections import defaultdict
from datetime import datetime
from app.models import get_db_connection

from app.routes.laptop.laptop_item_routes import laptop_item_bp
from app.routes.laptop.laptop_sales_routes import laptop_sales_bp

laptop_bp = Blueprint('laptop', __name__)
laptop_bp.register_blueprint(laptop_item_bp, url_prefix='/item')
laptop_bp.register_blueprint(laptop_sales_bp, url_prefix='/sales')

condition_mapping = {
    'Back to New': 'N',
    'Grade A': 'A',
    'Grade B': 'B',
    'Grade C': 'C',
    'Grade F': 'F'
}

@laptop_bp.route('/', methods=['GET', 'POST'])
def show_RMA_laptop_sheet():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        if request.method == 'POST':
            brand = request.form.get('brand', '').strip()
            model = request.form.get('model', '').strip()
            serial_number = request.form.get('serial_number', '').strip()
            tech_done = '1' if request.form.get('tech_done') else None
            tech_not_done = '0' if request.form.get('tech_not_done') else None
            stock_sold = 'SOLD' if request.form.get('stock_sold') else None
            stock_null = True if request.form.get('stock_null') else None
            
            conditions = request.form.get('conditions', '') 
            condition_list = [condition.strip() for condition in conditions.split(',') if condition.strip()]
            db_conditions = [condition_mapping.get(condition, condition) for condition in condition_list]

            query = "SELECT * FROM RMA_laptop_sheet WHERE 1=1"
            params = []
            
            if brand:
                query += " AND Brand = ?"
                params.append(brand)
            if model:
                query += " AND Model LIKE ?"
                params.append(f"%{model}%")
            if serial_number:
                query += " AND SerialNumber LIKE ?"
                params.append(f"%{serial_number}%")
            if db_conditions:
                query += " AND Condition IN (" + ",".join(["?"] * len(db_conditions)) + ")"
                params.extend(db_conditions)
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
            cursor.execute(query, params) if params else cursor.execute("SELECT * FROM RMA_laptop_sheet WHERE TechDone = '0'")
        else:
            cursor.execute("SELECT * FROM RMA_laptop_sheet WHERE TechDone = '0'")
        
        data = cursor.fetchall()
        columns = [column[0] for column in cursor.description]
        results = [dict(zip(columns, row)) for row in data]
        total_count = len(results)
        conn.close()
        return render_template('laptop/laptop.html', items=results, total_count=total_count)
    except Exception as e:
        return f"Error: {str(e)}"

@laptop_bp.route('/laptop_input')
def laptop_input():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM RMA_user")
        data = cursor.fetchall()

        conn.close()

        results = [row[0] for row in data]

        return render_template('laptop/laptop_input.html', users=results)
    except Exception as e:
        return f"Error: {str(e)}"
    
@laptop_bp.route('/laptop_SRP', methods=['GET'])
def laptop_SRP():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute("SELECT SaleDate FROM RMA_laptop_sheet")
        rows = cursor.fetchall()
        conn.close()

        sale_date_group = defaultdict(int)

        for row in rows:
            sale_date = row[0]

            if sale_date:
                sale_month = sale_date.strftime('%Y-%m')
                sale_date_group[sale_month] += 1

        return jsonify({
            'sale_date': dict(sale_date_group),
        })
    except Exception as e:
        return f"Error: {str(e)}"
    
@laptop_bp.route('/laptop_TRP', methods=['GET'])
def laptop_TRP():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute("SELECT InputDate, TechDoneDate FROM RMA_laptop_sheet")
        rows = cursor.fetchall()
        conn.close()

        input_date_group = defaultdict(int) #all laptop
        quickcheck_date_group = defaultdict(int) #quick check

        for row in rows:
            input_date, quickcheck_date = row

            if input_date:
                input_month = input_date.strftime('%Y-%m')
                input_date_group[input_month] += 1
                
            if quickcheck_date:
                tech_month = quickcheck_date.strftime('%Y-%m')
                quickcheck_date_group[tech_month] += 1
        
        # all laptop = included sealed and not sealed
        # quick check = only sealed laptop
        final_result = {
            key: input_date_group[key] - quickcheck_date_group.get(key, 0)
            for key in input_date_group
        }
        
        data = {
            'Full_qty': dict(final_result),
            'Quick_check_qty': dict(quickcheck_date_group)
        }
        
        # Create PDF in memory
        buffer = BytesIO()
        p = canvas.Canvas(buffer, pagesize=letter)
        width, height = letter

        p.setFont("Helvetica", 14)
        p.drawString(100, height - 50, "TRP Monthly Report")

        y = height - 100
        p.setFont("Helvetica", 12)

        # Draw Full_qty section
        p.drawString(50, y, "Full_qty:")
        y -= 20
        for month, qty in data["Full_qty"].items():
            p.drawString(70, y, f"{month}: {qty}")
            y -= 20

        y -= 10
        p.drawString(50, y, "Quick_check_qty:")
        y -= 20
        for month, qty in data["Quick_check_qty"].items():
            p.drawString(70, y, f"{month}: {qty}")
            y -= 20

        p.showPage()
        p.save()

        buffer.seek(0)

        # Send as response
        response = make_response(buffer.read())
        response.headers['Content-Type'] = 'application/pdf'
        response.headers['Content-Disposition'] = 'attachment; filename=trp_report.pdf'
        return response
    except Exception as e:
        return f"Error: {str(e)}"