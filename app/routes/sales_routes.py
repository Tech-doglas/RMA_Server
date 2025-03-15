# app/routes/sales_routes.py
from flask import Blueprint, render_template, request, redirect, url_for
from app.models import get_db_connection

sales_bp = Blueprint('sales', __name__)

@sales_bp.route('/')
def sales():
    try:
        return render_template('sales.html')
    except Exception as e:
        return f"Error: {str(e)}"

@sales_bp.route('/<serial_number>')
def sales_detail(serial_number):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM RMA_sheet WHERE SerialNumber = ?", serial_number)
        data = cursor.fetchone()

        if not data:
            return "Item not found", 404

        columns = [column[0] for column in cursor.description]
        laptop = dict(zip(columns, data))

        conn.close()
        return render_template('sales.html', laptop=laptop, serial_number=serial_number)
    except Exception as e:
        return f"Error: {str(e)}"

@sales_bp.route('/order', methods=['POST'])
def sales_order():
    try:
        # Get form data
        ram = request.form.get('ram')
        ssd = request.form.get('ssd')
        new_spec = f"{ram}+{ssd}"
        order_number = request.form.get('order')
        serial_number = request.form.get('serial_number')
        
        if not order_number:
            return "Order Number is required", 400

        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("SELECT Spec FROM RMA_sheet WHERE SerialNumber = ?", serial_number)
        result = cursor.fetchone()
        if not result:
            conn.close()
            return "Item not found", 404
        
        current_spec = result[0]
        
        if new_spec != current_spec:
            cursor.execute("""
                UPDATE RMA_sheet 
                SET OrderNumber = ?, Stock = 'SOLD', UpDatedSpec = ? 
                WHERE SerialNumber = ?
            """, (order_number, new_spec, serial_number))
        else:
            cursor.execute("""
                UPDATE RMA_sheet 
                SET OrderNumber = ?, Stock = 'SOLD' 
                WHERE SerialNumber = ?
            """, (order_number, serial_number))
        
        conn.commit()
        conn.close()
        return redirect(url_for('main.show_rma_sheet'))
    except Exception as e:
        return f"Error submitting item: {str(e)}"