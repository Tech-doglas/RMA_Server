# routes/laptop/sales.py
from flask import Blueprint, render_template, request, jsonify, current_app
from app.models import get_db_connection, db_connection
from app.permissions import current_session

laptop_sales_bp = Blueprint('laptop_sales', __name__)

@laptop_sales_bp.route('/<id>')
def sales_detail(id):
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM RMA_laptop_sheet WHERE ID = ?", id)
        data = cursor.fetchone()
        if not data:
            return "Item not found", 404
        laptop = dict(zip([column[0] for column in cursor.description], data))
        return render_template('laptop/laptop_sales.html', laptop=laptop, id=id)
    except Exception:
        current_app.logger.exception('Unable to load PC sale')
        return jsonify(error='Unable to load the sale. Please try again.'), 500
    finally:
        if conn is not None:
            conn.close()

@laptop_sales_bp.route('/order', methods=['POST'])
def sales_order():
    try:
        ram = request.form.get('ram')
        ssd = request.form.get('ssd')
        new_spec = f"{ram}+{ssd}"
        order_number = request.form.get('order', '').strip()
        id = request.form.get('id')

        if not order_number or len(order_number) > 255:
            return jsonify(error='Enter an order number of at most 255 characters.'), 400

        with db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT Spec, Stock, UpDatedSpec FROM RMA_laptop_sheet WITH (UPDLOCK, HOLDLOCK) WHERE ID = ?', id)
            result = cursor.fetchone()
            if not result:
                return jsonify(error='Item not found.'), 404
            if result[1] == 'SOLD':
                return jsonify(error='This item is already sold. Refresh the record before continuing.'), 409
            updated_spec = new_spec if ram is not None and ssd is not None and new_spec != result[0] else result[2]
            cursor.execute("""
                UPDATE RMA_laptop_sheet 
                SET OrderNumber = ?, Stock = 'SOLD', UpDatedSpec = ?, SaleDate = GETDATE(),
                    LastModifiedUser = ?, LastModifiedDateTime = GETDATE()
                WHERE ID = ?
            """, (order_number, updated_spec, current_session()['username'], id))
        return jsonify(message='Sale saved.'), 200
    except Exception:
        current_app.logger.exception('Unable to record PC sale')
        return jsonify(error='Unable to save the sale. Please try again.'), 500
