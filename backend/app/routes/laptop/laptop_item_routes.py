# app/routes/item_routes.py
from flask import Blueprint, render_template, request, redirect, send_from_directory, url_for, jsonify
from app.models import get_db_connection, get_modi_rma_root, save_laptop_images, get_laptop_image_files
import os
import shutil

laptop_item_bp = Blueprint('laptop_item', __name__)

@laptop_item_bp.route('/<id>', methods=['GET'])
def laptop_item_detail_api(id):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM RMA_laptop_sheet WHERE ID = ?", (id,))
        data = cursor.fetchone()
        if not data:
            return jsonify({'error': 'Item not found'}), 404
        laptop = dict(zip([column[0] for column in cursor.description], data))
        conn.close()
        return jsonify(laptop)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@laptop_item_bp.route('/submit', methods=['POST'])
def submit_item():
    try:
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
        user= request.form.get('user')
        
        if sealed:
            query = """
                INSERT INTO RMA_laptop_sheet 
                (Brand, Model, Spec, SerialNumber, OdooRef, Condition, Sealed, Stock, Remark, OdooRecord, LastModifiedUser,TechDoneDate, LastModifiedDateTime, InputDate) 
                OUTPUT INSERTED.ID
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, GETDATE(), GETDATE(), GETDATE())
            """
            values = (brand, model, spec, serial_number, odooRef, condition, sealed, stock, remark, odoo_record, user)
        else:
            query = """
                INSERT INTO RMA_laptop_sheet 
                (Brand, Model, Spec, SerialNumber, OdooRef, Condition, Sealed, Stock, Remark, OdooRecord, LastModifiedUser, LastModifiedDateTime, InputDate) 
                OUTPUT INSERTED.ID
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, GETDATE(), GETDATE())
            """
            values = (brand, model, spec, serial_number, odooRef, condition, sealed, stock, remark, odoo_record, user)
        
        cursor.execute(query, values)
        primary_key = cursor.fetchone()[0]
        save_laptop_images(request.files.getlist('images'), "laptop", primary_key)
        conn.commit()
        conn.close()
        return "OK", 200
    except Exception as e:
        return f"Error submitting item: {str(e)}"

@laptop_item_bp.route('/edit/<id>')
def edit_item(id):
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
        conn.close()
        return render_template('laptop/laptop_edit_item.html', laptop=laptop, image_files=image_files, users=users)
    except Exception as e:
        return f"Error: {str(e)}", 500

@laptop_item_bp.route('/update/<id>', methods=['POST'])
def update_item(id):
    try:
        brand = request.form.get('brand')
        model = request.form.get('model')
        spec = request.form.get('spec')
        serial_number_new = request.form.get('serial_number')
        odooRef = request.form.get('odooRef')
        condition = request.form.get('condition')
        sealed = True if request.form.get('sealed') else False
        stock_checkbox = request.form.get('stock')
        order_number = request.form.get('order_number')
        updated_spec = request.form.get('updated_spec')
        remark = request.form.get('remark')
        odoo_record = True if request.form.get('odoorecord') else False
        sku = request.form.get('sku', '')
        user = request.form.get('user')

        if stock_checkbox == "SOLD":
            stock = ""  # Checkbox is checked, meaning item is in stock (empty string)
        else:
            stock = "SOLD"  # Checkbox is unchecked, meaning item is sold

        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("SELECT Stock FROM RMA_laptop_sheet WHERE ID = ?", (id,))
        result = cursor.fetchone()
        current_stock = result[0] if result else ""
        
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
        
        images = request.files.getlist('new_images')
        if images:
            image_dir = os.path.join(get_modi_rma_root(), 'images', 'laptop', str(id))
            os.makedirs(image_dir, exist_ok=True)
            existing_images = get_laptop_image_files("laptop", id)
            next_image_num = len(existing_images) + 1
            for image in images:
                if image and image.filename:
                    from werkzeug.utils import secure_filename
                    ext = os.path.splitext(secure_filename(image.filename))[1]
                    filename = f"{next_image_num}{ext}"
                    image_path = os.path.join(image_dir, filename)
                    image.save(image_path)
                    next_image_num += 1
        
        conn.commit()
        conn.close()
        return redirect(url_for('laptop.laptop_item.laptop_item_detail', id=id))
    except Exception as e:
        return f"Error updating item: {str(e)}"

@laptop_item_bp.route('/delete/<id>')
def delete_item(id):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM RMA_laptop_sheet WHERE ID = ?", id)
        image_dir = os.path.join('images', 'laptop', str(id))
        if os.path.exists(image_dir):
            shutil.rmtree(image_dir)
        conn.commit()
        conn.close()
        return redirect(url_for('laptop.show_RMA_laptop_sheet'))
    except Exception as e:
        return f"Error deleting item: {str(e)}", 500

@laptop_item_bp.route('/delete_image/<id>/<filename>', methods=['POST'])
def delete_image(id, filename):
    try:
        image_dir = os.path.join(get_modi_rma_root(), 'images', 'laptop', str(id))
        image_path = os.path.join(image_dir, filename)
        if os.path.exists(image_path):
            os.remove(image_path)
            return "Image deleted successfully", 200
        return "Image not found", 404
    except Exception as e:
        return f"Error deleting image: {str(e)}", 500
    
@laptop_item_bp.route('/images/<id>/<filename>')
def serve_image(id, filename):
    try:
        image_dir = os.path.join(get_modi_rma_root(), 'images', 'laptop', str(id))
        if not os.path.exists(image_dir):
            return "Image directory not found", 404
        return send_from_directory(image_dir, filename)
    except Exception as e:
        return f"Error: {str(e)}", 500
    
@laptop_item_bp.route('/api/images/<id>')
def list_laptop_images(id):
    try:
        image_dir = os.path.join(get_modi_rma_root(), 'images', 'laptop', str(id))
        if not os.path.exists(image_dir):
            return jsonify([])
        filenames = os.listdir(image_dir)
        return jsonify(filenames)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@laptop_item_bp.route('/tech_done/<id>', methods=['POST'])
def mark_tech_done(id):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE RMA_laptop_sheet 
            SET TechDone = 1, LastModifiedDateTime = GETDATE()
            WHERE ID = ?
        """, (id,))
        conn.commit()
        conn.close()
        return jsonify({'status': 'success'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

