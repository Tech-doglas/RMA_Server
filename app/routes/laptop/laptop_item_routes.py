# app/routes/item_routes.py
from flask import Blueprint, render_template, request, redirect, send_from_directory, url_for
from app.models import get_db_connection, save_images, get_image_files, get_project_root
import os
import shutil

laptop_item_bp = Blueprint('laptop_item', __name__)

@laptop_item_bp.route('/<id>')
def laptop_item_detail(id):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM RMA_laptop_sheet WHERE ID = ?", id)
        data = cursor.fetchone()
        if not data:
            return "Item not found", 404
        laptop = dict(zip([column[0] for column in cursor.description], data))
        image_files = get_image_files(laptop['ID'])
        conn.close()
        return render_template('laptop/laptop_item_detail.html', laptop=laptop, image_files=image_files)
    except Exception as e:
        return f"Error: {str(e)}", 500

@laptop_item_bp.route('/images/<id>/<filename>')
def serve_image(id, filename):
    try:
        image_dir = os.path.join(get_project_root(), 'images', str(id))
        if not os.path.exists(image_dir):
            return "Image directory not found", 404
        return send_from_directory(image_dir, filename)
    except Exception as e:
        return f"Error: {str(e)}", 500

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
        remark = request.form.get('remark')
        sku = request.form.get('sku', '')
        tech_done = True if request.form.get('tech_done') else False
        user= request.form.get('user')

        cursor.execute("""
            INSERT INTO RMA_laptop_sheet (Brand, Model, Spec, SerialNumber, Condition, Sealed, Stock, Remark, OdooRecord, SKU, TechDone, LastModifiedUser, LastModifiedDateTime) 
            OUTPUT INSERTED.ID
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, GETDATE())
        """, (brand, model, spec, serial_number, condition, sealed, stock, remark, odoo_record, sku, tech_done, user))
        
        primary_key = cursor.fetchone()[0]
        save_images(request.files.getlist('images'), primary_key)
        conn.commit()
        conn.close()
        return redirect(url_for('laptop.laptop_input'))
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
        image_files = get_image_files(laptop['ID'])

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
        condition = request.form.get('condition')
        sealed = True if request.form.get('sealed') else False
        stock = request.form.get('stock')
        order_number = request.form.get('order_number')
        updated_spec = request.form.get('updated_spec')
        remark = request.form.get('remark')
        odoo_record = True if request.form.get('odoorecord') else False
        sku = request.form.get('sku', '')
        tech_done = True if request.form.get('tech_done') else False
        user = request.form.get('user')

        if stock is None:
            stock = ""

        print(stock)
        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute("""
                UPDATE RMA_laptop_sheet 
                SET Brand = ?, Model = ?, Spec = ?, SerialNumber = ?, Condition = ?, 
                    Sealed = ?, Stock = ?, OrderNumber = ?, UpDatedSpec = ?, Remark = ?, OdooRecord = ?, SKU = ?, TechDone = ?, LastModifiedUser = ?, LastModifiedDateTime = GETDATE()
                WHERE ID = ?
            """, (brand, model, spec, serial_number_new, condition, sealed, stock, 
                order_number, updated_spec, remark, odoo_record, sku, tech_done, user, id))
        
        images = request.files.getlist('new_images')
        if images:
            image_dir = os.path.join(get_project_root(), 'images', str(id))
            os.makedirs(image_dir, exist_ok=True)
            existing_images = get_image_files(id)
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
        image_dir = os.path.join('images', str(id))
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
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT ID FROM RMA_laptop_sheet WHERE ID = ?", id)
        if not cursor.fetchone():
            return "Item not found", 404
        image_dir = os.path.join(get_project_root(), 'images', str(id))
        image_path = os.path.join(image_dir, filename)
        if os.path.exists(image_path):
            os.remove(image_path)
            return "Image deleted successfully", 200
        return "Image not found", 404
    except Exception as e:
        return f"Error deleting image: {str(e)}", 500
    finally:
        conn.close()

@laptop_item_bp.route('/tech_done/<id>')
def tech_done(id):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("UPDATE RMA_laptop_sheet SET TechDone = 1 WHERE ID = ?", (id,))
        conn.commit()
        conn.close()
        return redirect(url_for('laptop.laptop_item.laptop_item_detail', id=id))
    except Exception as e:
        return f"Error updating TechDone: {str(e)}", 500