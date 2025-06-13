# routes/laptop/sales.py
from flask import Blueprint, render_template, request, redirect, url_for
from app.models import get_db_connection

non_laptop_sales_bp = Blueprint('non_laptop_sales', __name__)

@non_laptop_sales_bp.route('/order', methods=['POST'])
def sales_order():
    try:
        order_number = request.form.get('order')
        id = request.form.get('id')

        if not order_number:
            return "Order Number is required", 400

        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute("""
            UPDATE RMA_non_laptop_sheet 
            SET OrderNumber = ?, SaleDate = GETDATE()
            WHERE ID = ?
        """, (order_number, id))

        conn.commit()
        conn.close()
        return 200
    except Exception as e:
        return f"Error submitting item: {str(e)}"
