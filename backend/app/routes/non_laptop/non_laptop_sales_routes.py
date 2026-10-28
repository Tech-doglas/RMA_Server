# routes/laptop/sales.py
from flask import Blueprint, request, jsonify, current_app
from app.models import db_connection
from app.permissions import current_session

non_laptop_sales_bp = Blueprint('non_laptop_sales', __name__)

@non_laptop_sales_bp.route('/order', methods=['POST'])
def sales_order():
    try:
        order_number = request.form.get('order', '').strip()
        id = request.form.get('id')

        if not order_number or len(order_number) > 255:
            return jsonify(error='Enter an order number of at most 255 characters.'), 400

        with db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT SaleDate FROM RMA_non_laptop_sheet WITH (UPDLOCK, HOLDLOCK) WHERE ID = ?', id)
            item = cursor.fetchone()
            if not item:
                return jsonify(error='Item not found.'), 404
            if item[0]:
                return jsonify(error='This item is already sold. Refresh the record before continuing.'), 409
            cursor.execute("""
                UPDATE RMA_non_laptop_sheet
                SET OrderNumber = ?, SaleDate = GETDATE(), LastModifiedUser = ?, LastModifiedDateTime = GETDATE()
                WHERE ID = ?
            """, (order_number, current_session()['username'], id))
        return jsonify(message='Sale saved.'), 200
    except Exception:
        current_app.logger.exception('Unable to record non-PC sale')
        return jsonify(error='Unable to save the sale. Please try again.'), 500
