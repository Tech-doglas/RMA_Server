# routes/laptop/item.py
from flask import Blueprint, request, send_from_directory, jsonify
from app.models import get_db_connection, get_modi_rma_root, save_laptop_images, get_laptop_image_files
from app.uploads import image_directory, validate_images
from app.permissions import current_session, require_action
from flask import current_app
import os
import shutil

laptop_item_bp = Blueprint('laptop_item', __name__)

@laptop_item_bp.route('/<id>', methods=['GET'])
def laptop_item_detail_api(id):
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM RMA_laptop_sheet WHERE ID = ?", (id,))
        data = cursor.fetchone()
        if not data:
            return jsonify({'error': 'Item not found'}), 404
        laptop = dict(zip([column[0] for column in cursor.description], data))
        return jsonify(laptop)
    except Exception:
        current_app.logger.exception('Unable to load PC inventory item')
        return jsonify(error='Unable to load the item. Please try again.'), 500
    finally:
        if conn is not None:
            conn.close()

@laptop_item_bp.route('/submit', methods=['POST'])
def submit_item():
    conn = None
    try:
        images = validate_images(request.files.getlist('images'))
        conn = get_db_connection()
        cursor = conn.cursor()
        brand = request.form.get('brand')
        model = request.form.get('model')
        ram = request.form.get('ram')
        ssd = request.form.get('ssd')
        spec = f"{ram}+{ssd}"
        serial_number = request.form.get('serial_number')
        odooRef = request.form.get('OdooRef')
        condition = request.form.get('condition')
        sealed = True if request.form.get('sealed') else False
        odoo_record = True if request.form.get('odoorecord') else False
        stock = ""
        remark = request.form.get('remark')
        user = current_session()['username']
        
        if sealed:
            query = """
                INSERT INTO RMA_laptop_sheet 
                (Brand, Model, Spec, SerialNumber, OdooRef, Condition, Sealed, Stock, Remark, OdooRecord, LastModifiedUser,TechDoneDate, LastModifiedDateTime, InputDate, InputUser) 
                OUTPUT INSERTED.ID
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, GETDATE(), GETDATE(), GETDATE(), ?)
            """
            values = (brand, model, spec, serial_number, odooRef, condition, sealed, stock, remark, odoo_record, user, user)
        else:
            query = """
                INSERT INTO RMA_laptop_sheet 
                (Brand, Model, Spec, SerialNumber, OdooRef, Condition, Sealed, Stock, Remark, OdooRecord, LastModifiedUser, LastModifiedDateTime, InputDate, InputUser) 
                OUTPUT INSERTED.ID
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, GETDATE(), GETDATE(), ?)
            """
            values = (brand, model, spec, serial_number, odooRef, condition, sealed, stock, remark, odoo_record, user, user)
        
        cursor.execute(query, values)
        primary_key = cursor.fetchone()[0]
        save_laptop_images(images, "laptop", primary_key)
        conn.commit()
        return "OK", 200
    except ValueError as exc:
        return jsonify(error=str(exc)), 400
    except Exception:
        current_app.logger.exception('Unable to create PC inventory item')
        return jsonify(error='Unable to save the item. Please try again.'), 500
    finally:
        if conn is not None:
            conn.close()

@laptop_item_bp.route('/edit/<id>', methods=['POST'])
def edit_laptop(id):
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM RMA_laptop_sheet WHERE ID = ?", id)
        data = cursor.fetchone()
        if not data:
            return "Item not found", 404
        laptop = dict(zip([column[0] for column in cursor.description], data))
        image_files = get_laptop_image_files("laptop", laptop['ID'])

        cursor.execute("SELECT * FROM RMA_user")
        data = cursor.fetchall()

        users = [row[0] for row in data]
        return "OK", 200
    except Exception:
        current_app.logger.exception('Unable to load PC editor')
        return jsonify(error='Unable to load the item. Please try again.'), 500
    finally:
        if conn is not None:
            conn.close()

@laptop_item_bp.route('/update/<id>', methods=['POST'])
def update_item(id):
    conn = None
    try:
        images = validate_images(request.files.getlist('new_images'))
        image_directory(get_modi_rma_root(), 'laptop', id)
        brand = request.form.get('brand')
        model = request.form.get('model')
        spec = request.form.get('spec')
        serial_number_new = request.form.get('serial_number')
        odooRef = request.form.get('odooRef')
        condition = request.form.get('condition')
        sealed = True if request.form.get('sealed') else False
        stock_checkbox = request.form.get('stock')
        order_number = request.form.get('order_number')
        updated_spec = request.form.get('updated_spec', request.form.get('updatedSpec'))
        remark = request.form.get('remark')
        odoo_record = True if request.form.get('odoorecord') else False
        sku = request.form.get('sku', '')
        user = current_session()['username']

        if stock_checkbox == "SOLD":
            stock = ""  # Checkbox is checked, meaning item is in stock (empty string)
        else:
            stock = "SOLD"  # Checkbox is unchecked, meaning item is sold

        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("SELECT Stock, OrderNumber, UpDatedSpec FROM RMA_laptop_sheet WITH (UPDLOCK, HOLDLOCK) WHERE ID = ?", (id,))
        result = cursor.fetchone()
        if not result:
            return jsonify(error='Item not found.'), 404
        current_stock = result[0] or ''
        if 'stock' not in request.form:
            stock = current_stock
        if 'order_number' not in request.form:
            order_number = result[1]
        if 'updated_spec' not in request.form and 'updatedSpec' not in request.form:
            updated_spec = result[2]
        if any((new or '') != (old or '') for new, old in ((stock, current_stock), (order_number, result[1]), (updated_spec, result[2]))):
            require_action('pc.sell')
        
        sale_date_sql = ""
        
        if current_stock == "SOLD" and stock == '':
            sale_date_sql = ", SaleDate = NULL"
            
        
        query = f"""
                UPDATE RMA_laptop_sheet 
                SET Brand = ?, Model = ?, Spec = ?, SerialNumber = ?, OdooRef = ?, Condition = ?, 
                    Sealed = ?, Stock = ?, OrderNumber = ?, UpDatedSpec = ?, Remark = ?, OdooRecord = ?, 
                    SKU = ?, LastModifiedUser = ?, LastModifiedDateTime = GETDATE()
                    {sale_date_sql}
                WHERE ID = ?
            """
            
        cursor.execute(query, (brand, model, spec, serial_number_new, odooRef, condition, sealed, stock, 
                order_number, updated_spec, remark, odoo_record, sku, user, id))
        
        save_laptop_images(images, 'laptop', id)
        
        conn.commit()
        return "OK", 200
    except PermissionError as exc:
        return jsonify(error=str(exc)), 403
    except ValueError as exc:
        return jsonify(error=str(exc)), 400
    except Exception:
        current_app.logger.exception('Unable to update PC inventory item')
        return jsonify(error='Unable to update the item. Please try again.'), 500
    finally:
        if conn is not None:
            conn.close()

@laptop_item_bp.route('/api/item/<id>', methods=['DELETE'])
def delete_item(id):
    conn = None
    try:
        image_dir = image_directory(get_modi_rma_root(), 'laptop', id)
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM RMA_laptop_sheet WHERE ID = ?", (id,))
        if os.path.exists(image_dir):
            shutil.rmtree(image_dir)
        conn.commit()
        return {"message": "Item deleted successfully"}, 200
    except ValueError as exc:
        return jsonify(error=str(exc)), 400
    except Exception:
        current_app.logger.exception('Unable to delete PC inventory item')
        return jsonify(error='Unable to delete the item. Please try again.'), 500
    finally:
        if conn is not None:
            conn.close()

@laptop_item_bp.route('/tech_done/<id>', methods=['POST'])
def mark_tech_done(id):
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE RMA_laptop_sheet 
            SET TechDone = 1, TechDoneDate = GETDATE(), LastModifiedUser = ?, LastModifiedDateTime = GETDATE()
            WHERE ID = ?
        """, (current_session()['username'], id))
        conn.commit()
        return jsonify({'status': 'success'})
    except Exception:
        current_app.logger.exception('Unable to mark PC inspection complete')
        return jsonify(error='Unable to update the inspection. Please try again.'), 500
    finally:
        if conn is not None:
            conn.close()
