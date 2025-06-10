# app/routes/item_routes.py
from flask import Blueprint, render_template, request, redirect, send_from_directory, url_for, jsonify
from app.models import get_db_connection, save_laptop_images, get_laptop_image_files, get_modi_rma_root
import os
import shutil

non_laptop_item_bp = Blueprint('non_laptop_item', __name__)

@non_laptop_item_bp.route('/submit', methods=['POST'])
def submit_item():
    try:
        tracking_number = request.form.get('tracking_number')
        category = request.form.get('category')
        name = request.form.get('name')
        odoo_ref = request.form.get('OdooRef')
        condition = request.form.get('condition', '')
        received_date = request.form.get('received_date')
        quantity = int(request.form.get('qty'))
        remark = request.form.get('remark')
        user = request.form.get('user')
        location = request.form.get('location')

        conn = get_db_connection()
        cursor = conn.cursor()

        for _ in range(quantity):
            cursor.execute(
                """
                INSERT INTO RMA_non_laptop_sheet (
                    TrackingNumber, 
                    Category, 
                    Name, 
                    OdooRef, 
                    Condition, 
                    ReceivedDate, 
                    Remark, 
                    LastModifiedUser, 
                    LastModifiedDateTime, 
                    Location,
                    InputDate
                ) 
                OUTPUT INSERTED.ID
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, GETDATE(), ?, GETDATE())
                """,
                (
                    tracking_number,
                    category,
                    name,
                    odoo_ref,
                    condition,
                    received_date,
                    remark,
                    user,
                    location
                )
            )
        
        save_laptop_images(request.files.getlist('images'), "non_laptop" , tracking_number)
        conn.commit()
        conn.close()
        return "OK", 200
    except Exception as e:
        return f"Error submitting item: {str(e)}"

@non_laptop_item_bp.route('/api/<id>', methods=['GET'])
def get_non_laptop_item(id):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM RMA_non_laptop_sheet WHERE ID = ?", (id,))
        data = cursor.fetchone()
        if not data:
            return jsonify({'error': 'Item not found'}), 404
        columns = [col[0] for col in cursor.description]
        item = dict(zip(columns, data))

        if item['ReceivedDate']:
            from datetime import datetime
            if isinstance(item['ReceivedDate'], str):
                date_obj = datetime.strptime(item['ReceivedDate'], '%Y-%m-%d %H:%M:%S')
            else:
                date_obj = item['ReceivedDate']
            item['ReceivedDate'] = date_obj.strftime('%Y-%m-%d')
        
        conn.close()
        return jsonify(item)
    except Exception as e:
        return f"Error: {str(e)}", 500

@non_laptop_item_bp.route('/api/update/<id>', methods=['POST'])
def api_update_item(id):
    try:
        tracking_number = request.form.get('trackingNumber')
        category = request.form.get('category')
        name = request.form.get('name')
        odoo_ref = request.form.get('odooRef')
        condition = request.form.get('condition', '')
        received_date = request.form.get('receivedDate')
        remark = request.form.get('remark')
        user = request.form.get('user')
        location = request.form.get('location')

        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute("""
            UPDATE RMA_non_laptop_sheet 
            SET 
                TrackingNumber = ?, 
                Category = ?, 
                Name = ?, 
                OdooRef = ?, 
                Condition = ?, 
                ReceivedDate = ?, 
                Remark = ?, 
                LastModifiedUser = ?, 
                LastModifiedDateTime = GETDATE(), 
                Location = ?
            WHERE ID = ?
        """, (tracking_number, category, name, odoo_ref, condition, received_date, remark, user, location, id))
        
        images = request.files.getlist('new_images')
        if images:
            image_dir = os.path.join(get_modi_rma_root(), 'images', 'non_laptop', tracking_number)
            os.makedirs(image_dir, exist_ok=True)
            existing_images = get_laptop_image_files("non_laptop", tracking_number)
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
        return jsonify({'message': 'Updated successfully'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@non_laptop_item_bp.route('/delete/<id>', methods=['DELETE'])
def delete_item(id):
    try:
        tracking_number = request.args.get('TrackingNumber')

        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM RMA_non_laptop_sheet WHERE ID = ?", (id,))
        cursor.execute("SELECT 1 FROM RMA_non_laptop_sheet WHERE TrackingNumber = ?", (tracking_number,))
        remaining = cursor.fetchone()

        if not remaining:
            image_dir = os.path.join('images', 'non_laptop', tracking_number)
            if os.path.exists(image_dir):
                shutil.rmtree(image_dir)

        conn.commit()
        conn.close()
        return '', 204  # No Content (frontend can handle redirect or success)
    except Exception as e:
        return f"Error deleting item: {str(e)}", 500