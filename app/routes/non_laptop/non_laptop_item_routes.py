# app/routes/item_routes.py
from flask import Blueprint, render_template, request, redirect, send_from_directory, url_for
from app.models import get_db_connection, save_laptop_images, get_laptop_image_files, get_project_root
import os
import shutil

non_laptop_item_bp = Blueprint('non_laptop_item', __name__)

@non_laptop_item_bp.route('/<id>')
def non_laptop_item_detail(id):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM RMA_non_laptop_sheet WHERE ID = ?", id)
        data = cursor.fetchone()
        if not data:
            return "Item not found", 404
        non_laptop = dict(zip([column[0] for column in cursor.description], data))
        image_files = get_laptop_image_files("non_laptop", non_laptop['TrackingNumber'])
        conn.close()
        return render_template('non_laptop/non_laptop_item_detail.html', non_laptop=non_laptop, image_files=image_files)
    except Exception as e:
        return f"Error: {str(e)}", 500

@non_laptop_item_bp.route('/images/<id>/<filename>')
def serve_image(id, filename):
    try:
        image_dir = os.path.join(get_project_root(), 'images', 'non_laptop' ,str(id))
        if not os.path.exists(image_dir):
            return "Image directory not found", 404
        return send_from_directory(image_dir, filename)
    except Exception as e:
        return f"Error: {str(e)}", 500

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
                    Location
                ) 
                OUTPUT INSERTED.ID
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, GETDATE(), ?)
                """,
                (
                    tracking_number,
                    category,
                    name,
                    odoo_ref,
                    condition if condition else None,
                    received_date,
                    remark,
                    user,
                    location
                )
            )
        
        save_laptop_images(request.files.getlist('images'), "non_laptop" , tracking_number)
        conn.commit()
        conn.close()
        return redirect(url_for('non_laptop.non_laptop_input'))
    except Exception as e:
        return f"Error submitting item: {str(e)}"

@non_laptop_item_bp.route('/edit/<id>')
def edit_item(id):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM RMA_non_laptop_sheet WHERE ID = ?", id)
        data = cursor.fetchone()
        if not data:
            return "Item not found", 404
        non_laptop = dict(zip([column[0] for column in cursor.description], data))

        if non_laptop['ReceivedDate']:
            if isinstance(non_laptop['ReceivedDate'], str):
                # If it's already a string, parse it to a datetime first
                from datetime import datetime
                date_obj = datetime.strptime(non_laptop['ReceivedDate'], '%Y-%m-%d %H:%M:%S')
                non_laptop['ReceivedDate'] = date_obj.strftime('%Y-%m-%d')
            else:
                # If it's a datetime object from the database
                non_laptop['ReceivedDate'] = non_laptop['ReceivedDate'].strftime('%Y-%m-%d')
                
        image_files = get_laptop_image_files("non_laptop", non_laptop['TrackingNumber'])
        

        cursor.execute("SELECT * FROM RMA_user")
        data = cursor.fetchall()

        users = [row[0] for row in data]
        conn.close()
        return render_template('non_laptop/non_laptop_edit_item.html', non_laptop=non_laptop, image_files=image_files, users=users)
    except Exception as e:
        return f"Error: {str(e)}", 500

@non_laptop_item_bp.route('/update/<id>', methods=['POST'])
def update_item(id):
    try:
        tracking_number = request.form.get('tracking_number')
        category = request.form.get('category')
        name = request.form.get('name')
        odoo_ref = request.form.get('OdooRef')
        condition = request.form.get('condition', '')
        received_date = request.form.get('received_date')
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
            image_dir = os.path.join(get_project_root(), 'images', 'non_laptop', tracking_number)
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
        return redirect(url_for('non_laptop.non_laptop_item.non_laptop_item_detail', id=id))
    except Exception as e:
        return f"Error updating item: {str(e)}"

@non_laptop_item_bp.route('/delete/<id>')
def delete_item(id):
    try:
        tracking_number = request.args.get('TrackingNumber')

        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM RMA_non_laptop_sheet WHERE ID = ?", id)
        cursor.execute("SELECT * FROM RMA_non_laptop_sheet WHERE TrackingNumber = ?", tracking_number)
        data = cursor.fetchall()
        non_laptop = dict(zip([column[0] for column in cursor.description], data))
        if len(non_laptop) == 0:
            image_dir = os.path.join('images', 'non_laptop', tracking_number)
            if os.path.exists(image_dir):
                shutil.rmtree(image_dir)
        conn.commit()
        conn.close()
        return redirect(url_for('non_laptop.show_RMA_non_laptop_sheet'))
    except Exception as e:
        return f"Error deleting item: {str(e)}", 500

@non_laptop_item_bp.route('/delete_image/<id>/<filename>', methods=['POST'])
def delete_image(id, filename):
    try:
        image_dir = os.path.join(get_project_root(), 'images', "non_laptop", str(id))
        image_path = os.path.join(image_dir, filename)
        if os.path.exists(image_path):
            os.remove(image_path)
            return "Image deleted successfully", 200
        return "Image not found", 404
    except Exception as e:
        return f"Error deleting image: {str(e)}", 500