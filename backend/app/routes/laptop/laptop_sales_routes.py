# app/routes/sales_routes.py
from flask import Blueprint, render_template, request, redirect, url_for
from app.models import get_db_connection

laptop_sales_bp = Blueprint('laptop_sales', __name__)

@laptop_sales_bp.route('/<id>')
def sales_detail(id):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM RMA_laptop_sheet WHERE ID = ?", id)
        data = cursor.fetchone()
        if not data:
            return "Item not found", 404
        laptop = dict(zip([column[0] for column in cursor.description], data))
        conn.close()
        return render_template('laptop/laptop_sales.html', laptop=laptop, id=id)
    except Exception as e:
        return f"Error: {str(e)}", 500

@laptop_sales_bp.route('/order', methods=['POST'])
def sales_order():
    try:
        # Get form data
        ram = request.form.get('ram')
        ssd = request.form.get('ssd')
        new_spec = f"{ram}+{ssd}"
        order_number = request.form.get('order')
        id = request.form.get('id')
        
        if not order_number:
            return "Order Number is required", 400

        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("SELECT Spec FROM RMA_laptop_sheet WHERE ID = ?", id)
        result = cursor.fetchone()
        if not result:
            conn.close()
            return "Item not found", 404
        
        current_spec = result[0]
        
        if new_spec != current_spec:
            cursor.execute("""
                UPDATE RMA_laptop_sheet 
                SET OrderNumber = ?, Stock = 'SOLD', UpDatedSpec = ?, SaleDate = GETDATE()
                WHERE ID = ?
            """, (order_number, new_spec, id))
        else:
            cursor.execute("""
                UPDATE RMA_laptop_sheet 
                SET OrderNumber = ?, Stock = 'SOLD', SaleDate = GETDATE()
                WHERE ID = ?
            """, (order_number, id))
        
        conn.commit()
        conn.close()
        return redirect(url_for('laptop.show_RMA_laptop_sheet'))
    except Exception as e:
        return f"Error submitting item: {str(e)}"