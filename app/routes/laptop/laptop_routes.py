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
        cursor.execute("SELECT SaleDate, Stock, Condition FROM RMA_laptop_sheet")
        rows = cursor.fetchall()
        conn.close()

        valid_grades = {'N', 'A', 'B', 'C', 'F'}
        grades_seen = set()

        # Track sales by month and grade
        sold_by_month_and_grade = defaultdict(lambda: defaultdict(int))

        # Count total inventory by grade
        total_inventory_by_grade = defaultdict(int)
        
        # Track all months for ordering
        all_months = set()

        # First pass: Count total inventory and identify all grades
        for sale_date, stock, grade in rows:
            grade = (grade or '').strip().upper()
            if grade not in valid_grades:
                grade = 'Unknown'
            grades_seen.add(grade)
            
            # Count all items in inventory regardless of status
            total_inventory_by_grade[grade] += 1
            
            # Record sales by month
            if stock == 'SOLD' and sale_date:
                sale_month = sale_date.strftime('%Y-%m')
                sold_by_month_and_grade[sale_month][grade] += 1
                all_months.add(sale_month)

        sorted_months = sorted(all_months)
        
        # Calculate stock at the end of each month
        stock_by_month = defaultdict(lambda: defaultdict(int))
        cumulative_sold_by_grade = defaultdict(int)
        
        for month in sorted_months:
            for grade in grades_seen:
                # Add sales for this month to the running total
                sold_this_month = sold_by_month_and_grade[month].get(grade, 0)
                cumulative_sold_by_grade[grade] += sold_this_month
                
                # Stock at end of month = total inventory - cumulative sold
                stock_by_month[month][grade] = total_inventory_by_grade[grade] - cumulative_sold_by_grade[grade]

        # --- PDF Generation ---
        buffer = BytesIO()
        p = canvas.Canvas(buffer, pagesize=letter)
        width, height = letter
        y = height - 50

        p.setFont("Helvetica-Bold", 16)
        p.drawString(50, y, "Sales & Stock Report by Grade")
        y -= 30

        p.setFont("Helvetica", 12)
        for month in sorted_months:
            p.drawString(50, y, f"Month: {month}")
            y -= 20

            # SOLD section
            p.drawString(70, y, "SOLD:")
            y -= 15
            sold_total = 0
            for grade in sorted(grades_seen):
                qty = sold_by_month_and_grade[month].get(grade, 0)
                sold_total += qty
                p.drawString(90, y, f"Grade {grade}: {qty}")
                y -= 15
            p.drawString(90, y, f"total: {sold_total}")
            y -= 25

            # In Stock section
            p.drawString(70, y, "In Stock (End of Month):")
            y -= 15
            stock_total = 0
            for grade in sorted(grades_seen):
                qty = stock_by_month[month].get(grade, 0)
                stock_total += qty
                p.drawString(90, y, f"Grade {grade}: {qty}")
                y -= 15
            p.drawString(90, y, f"total: {stock_total}")
            y -= 30

            if y < 100:
                p.showPage()
                y = height - 50
                p.setFont("Helvetica", 12)

        p.save()
        buffer.seek(0)

        response = make_response(buffer.read())
        response.headers['Content-Type'] = 'application/pdf'
        response.headers['Content-Disposition'] = 'attachment; filename=sales_stock_report.pdf'
        return response
    except Exception as e:
        return f"Error: {str(e)}"

@laptop_bp.route('/laptop_ARP', methods=['GET'])
def laptop_ARP():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute("SELECT Stock, OrderNumber FROM RMA_laptop_sheet")
        rows = cursor.fetchall()
        conn.close()

        sold_rows = [row for row in rows if row[0] == "SOLD"]
        sold_count = len(sold_rows)

        # Create PDF in memory
        buffer = BytesIO()
        p = canvas.Canvas(buffer, pagesize=letter)
        width, height = letter

        p.setFont("Helvetica", 14)
        p.drawString(100, height - 50, "ARP Stock Report")

        y = height - 100
        p.setFont("Helvetica", 12)
        p.drawString(50, y, f"SOLD: {sold_count}")
        y -= 20

        p.setFont("Helvetica", 10)
        p.drawString(50, y, "Order Numbers:")
        y -= 15

        for _, order_number in sold_rows:
            if y < 50:
                p.showPage()
                y = height - 50
                p.setFont("Helvetica", 10)

            p.drawString(60, y, str(order_number))
            y -= 15

        p.showPage()
        p.save()

        buffer.seek(0)

        response = make_response(buffer.read())
        response.headers['Content-Type'] = 'application/pdf'
        response.headers['Content-Disposition'] = 'attachment; filename=arp_report.pdf'
        return response

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