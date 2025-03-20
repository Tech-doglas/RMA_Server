# app/routes/item_routes.py
from flask import Blueprint, render_template, request, redirect, send_from_directory, url_for
from app.models import get_db_connection, save_images, get_image_files, get_project_root
import os
import shutil

laptop_item_bp = Blueprint('laptop_item', __name__)

@laptop_item_bp.route('/<serial_number>')
def laptop_item_detail(serial_number):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM RMA_laptop_sheet WHERE SerialNumber = ?", serial_number)
        data = cursor.fetchone()
        if not data:
            return "Item not found", 404
        laptop = dict(zip([column[0] for column in cursor.description], data))
        image_files = get_image_files(laptop['ID'])
        conn.close()
        return render_template('laptop_item_detail.html', laptop=laptop, image_files=image_files)
    except Exception as e:
        return f"Error: {str(e)}"

@laptop_item_bp.route('/images/<id>/<filename>')
def serve_image(id, filename):
    image_dir = os.path.join(get_project_root(), 'images', str(id))
    return send_from_directory(image_dir, filename)

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
        condition = request.form.get('condition')
        sealed = True if request.form.get('sealed') else False
        odoo_record = True if request.form.get('odoorecord') else False
        stock = ""
        remark = request.form.get('textarea')
        sku = request.form.get('sku', '')
        tech_done = True if request.form.get('tech_done') else False

        cursor.execute("""
            INSERT INTO RMA_laptop_sheet (Brand, Model, Spec, SerialNumber, Condition, Sealed, Stock, Remark, OdooRecord, SKU, TechDone) 
            OUTPUT INSERTED.ID
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (brand, model, spec, serial_number, condition, sealed, stock, remark, odoo_record, sku, tech_done))
        
        primary_key = cursor.fetchone()[0]
        save_images(request.files.getlist('images'), primary_key)
        conn.commit()
        conn.close()
        return redirect(url_for('laptop.laptop_input'))
    except Exception as e:
        return f"Error submitting item: {str(e)}"

@laptop_item_bp.route('/edit/<serial_number>')
def edit_item(serial_number):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM RMA_laptop_sheet WHERE SerialNumber = ?", serial_number)
        data = cursor.fetchone()
        if not data:
            return "Item not found", 404
        laptop = dict(zip([column[0] for column in cursor.description], data))
        image_files = get_image_files(laptop['ID'])
        conn.close()
        return render_template('laptop_edit_item.html', laptop=laptop, image_files=image_files)
    except Exception as e:
        return f"Error: {str(e)}"

@laptop_item_bp.route('/update/<serial_number>', methods=['POST'])
def update_item(serial_number):
    try:
        brand = request.form.get('brand')
        model = request.form.get('model')
        spec = request.form.get('spec')
        serial_number_new = request.form.get('serial_number')
        condition = request.form.get('condition')
        sealed = True if request.form.get('sealed') else False
        stock = request.form.get('stock')
        order_number = request.form.get('order_number')
        updated_spec = request.form.get('updated_spec')
        remark = request.form.get('remark')
        odoo_record = True if request.form.get('odoorecord') else False
        sku = request.form.get('sku', '')
        tech_done = True if request.form.get('tech_done') else False

        if stock is None:
            stock = ""

        print(stock)
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("SELECT ID FROM RMA_laptop_sheet WHERE SerialNumber = ?", serial_number)
        item_id = cursor.fetchone()[0]
        
        cursor.execute("""
            UPDATE RMA_laptop_sheet 
            SET Brand = ?, Model = ?, Spec = ?, SerialNumber = ?, Condition = ?, 
                Sealed = ?, Stock = ?, OrderNumber = ?, UpDatedSpec = ?, Remark = ?, OdooRecord = ?, SKU = ?, TechDone = ?
            WHERE SerialNumber = ?
        """, (brand, model, spec, serial_number_new, condition, sealed, stock, 
              order_number, updated_spec, remark, odoo_record, sku, tech_done, serial_number))
        
        image_dir = os.path.join(get_project_root(), 'images', str(item_id))
        os.makedirs(image_dir, exist_ok=True)
        
        images = request.files.getlist('new_images')
        existing_images = get_image_files(item_id)
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
        return redirect(url_for('laptop.laptop_item.laptop_item_detail', serial_number=serial_number_new))
    except Exception as e:
        return f"Error updating item: {str(e)}"

@laptop_item_bp.route('/delete/<serial_number>')
def delete_item(serial_number):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM RMA_laptop_sheet WHERE SerialNumber = ?", serial_number)
        
        image_dir = os.path.join('images', str(serial_number))
        if os.path.exists(image_dir):
            shutil.rmtree(image_dir)
        
        conn.commit()
        conn.close()
        return redirect(url_for('laptop.show_RMA_laptop_sheet'))
    except Exception as e:
        return f"Error deleting item: {str(e)}"

@laptop_item_bp.route('/delete_image/<serial_number>/<filename>', methods=['POST'])
def delete_image(serial_number, filename):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT ID FROM RMA_laptop_sheet WHERE SerialNumber = ?", serial_number)
        item = cursor.fetchone()
        
        if not item:
            return "Item not found", 404
            
        item_id = item[0]
        image_dir = os.path.join(get_project_root(), 'images', str(item_id))
        image_path = os.path.join(image_dir, filename)
        
        if os.path.exists(image_path):
            os.remove(image_path)
            return "Image deleted successfully", 200
        else:
            return "Image not found", 404
            
    except Exception as e:
        return f"Error deleting image: {str(e)}", 500
    finally:
        conn.close()

@laptop_item_bp.route('/tech_done/<serial_number>')
def tech_done(serial_number):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("UPDATE RMA_laptop_sheet SET TechDone = 1 WHERE SerialNumber = ?", (serial_number,))
        conn.commit()
        conn.close()
        return redirect(url_for('laptop.laptop_item.laptop_item_detail', serial_number=serial_number))
    except Exception as e:
        return f"Error updating TechDone: {str(e)}"