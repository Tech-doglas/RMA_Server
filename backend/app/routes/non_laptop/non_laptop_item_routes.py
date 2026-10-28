# app/routes/item_routes.py
from flask import Blueprint, render_template, request, redirect, send_from_directory, url_for, jsonify
from app.models import get_db_connection, save_laptop_images, get_laptop_image_files, get_modi_rma_root
from app.uploads import image_directory, validate_images
from app.permissions import current_session, require_action
from flask import current_app
import os
import shutil

non_laptop_item_bp = Blueprint('non_laptop_item', __name__)

@non_laptop_item_bp.route('/submit', methods=['POST'])
def submit_item():
    conn = None
    try:
        images = validate_images(request.files.getlist('images'))
        tracking_number = request.form.get('tracking_number')
        image_directory(get_modi_rma_root(), 'non_laptop', tracking_number)
        category = request.form.get('category')
        name = request.form.get('name')
        odoo_ref = request.form.get('OdooRef')
        condition = request.form.get('condition', '')
        received_date = request.form.get('received_date')
        try:
            quantity = int(request.form.get('qty', ''))
        except (ValueError, TypeError):
            raise ValueError('Quantity must be a whole number from 1 to 1000.')
        if not 1 <= quantity <= 1000:
            raise ValueError('Quantity must be a whole number from 1 to 1000.')
        odoo_record = request.form.get('odooRecord', '0')
        remark = request.form.get('remark')
        user = current_session()['username']
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
                    OdooRecord, 
                    Remark, 
                    LastModifiedUser, 
                    LastModifiedDateTime, 
                    Location,
                    InputDate
                ) 
                OUTPUT INSERTED.ID
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, GETDATE(), ?, GETDATE())
                """,
                (
                    tracking_number,
                    category,
                    name,
                    odoo_ref,
                    condition,
                    received_date,
                    odoo_record,
                    remark,
                    user,
                    location
                )
            )
        
        save_laptop_images(images, "non_laptop", tracking_number)
        conn.commit()
        return "OK", 200
    except ValueError as exc:
        return jsonify(error=str(exc)), 400
    except Exception:
        current_app.logger.exception('Unable to create non-PC inventory item')
        return jsonify(error='Unable to save the item. Please try again.'), 500
    finally:
        if conn is not None:
            conn.close()

@non_laptop_item_bp.route('/api/<id>', methods=['GET'])
def get_non_laptop_item(id):
    conn = None
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
                date_obj = datetime.fromisoformat(item['ReceivedDate'])
            else:
                date_obj = item['ReceivedDate']
            item['ReceivedDate'] = date_obj.strftime('%Y-%m-%d')
        
        return jsonify(item)
    except Exception:
        current_app.logger.exception('Unable to load non-PC inventory item')
        return jsonify(error='Unable to load the item. Please try again.'), 500
    finally:
        if conn is not None:
            conn.close()

@non_laptop_item_bp.route('/api/update/<id>', methods=['POST'])
def api_update_item(id):
    conn = None
    try:
        images = validate_images(request.files.getlist('new_images'))
        tracking_number = request.form.get('trackingNumber')
        image_directory(get_modi_rma_root(), 'non_laptop', tracking_number)
        category = request.form.get('category')
        name = request.form.get('name')
        odoo_ref = request.form.get('odooRef')
        condition = request.form.get('condition', '')
        received_date = request.form.get('receivedDate')
        remark = request.form.get('remark')
        user = current_session()['username']
        location = request.form.get('location')
        order_number = request.form.get('orderNumber')
        sku = request.form.get('sku', '')
        odoo_record = request.form.get('odooRecord', '0')

        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute('SELECT OrderNumber FROM RMA_non_laptop_sheet WITH (UPDLOCK, HOLDLOCK) WHERE ID = ?', id)
        original = cursor.fetchone()
        if not original:
            return jsonify(error='Item not found.'), 404
        if 'orderNumber' not in request.form:
            order_number = original[0]
        if (order_number or '') != (original[0] or ''):
            require_action('nonpc.sell')

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
                Location = ?,
                OrderNumber = ?,
                SKU = ?,
                OdooRecord = ?
            WHERE ID = ?
        """, (tracking_number, category, name, odoo_ref, condition, received_date, remark, user, location, order_number, sku, odoo_record, id))
        
        save_laptop_images(images, 'non_laptop', tracking_number)
        
        conn.commit()
        return jsonify({'message': 'Updated successfully'})
    except PermissionError as exc:
        return jsonify(error=str(exc)), 403
    except ValueError as exc:
        return jsonify(error=str(exc)), 400
    except Exception:
        current_app.logger.exception('Unable to update non-PC inventory item')
        return jsonify(error='Unable to update the item. Please try again.'), 500
    finally:
        if conn is not None:
            conn.close()

@non_laptop_item_bp.route('/api/distributed/<id>', methods=['POST'])
def mark_order_distributed(id):
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE RMA_non_laptop_sheet 
            SET OrderDistributed = 1, LastModifiedUser = ?, LastModifiedDateTime = GETDATE()
            WHERE ID = ?
        """, (current_session()['username'], id))
        conn.commit()
        return jsonify({'status': 'success'})
    except Exception:
        current_app.logger.exception('Unable to mark non-PC order distributed')
        return jsonify(error='Unable to update the order. Please try again.'), 500
    finally:
        if conn is not None:
            conn.close()

@non_laptop_item_bp.route('/delete/<id>', methods=['DELETE'])
def delete_item(id):
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('SELECT TrackingNumber FROM RMA_non_laptop_sheet WHERE ID = ?', (id,))
        found = cursor.fetchone()
        if not found:
            return jsonify(error='Item not found.'), 404
        tracking_number = found[0]
        image_dir = image_directory(get_modi_rma_root(), 'non_laptop', tracking_number)
        cursor.execute("DELETE FROM RMA_non_laptop_sheet WHERE ID = ?", (id,))
        cursor.execute("SELECT 1 FROM RMA_non_laptop_sheet WHERE TrackingNumber = ?", (tracking_number,))
        remaining = cursor.fetchone()

        if not remaining:
            if os.path.exists(image_dir):
                shutil.rmtree(image_dir)

        conn.commit()
        return '', 204  # No Content (frontend can handle redirect or success)
    except ValueError as exc:
        return jsonify(error=str(exc)), 400
    except Exception:
        current_app.logger.exception('Unable to delete non-PC inventory item')
        return jsonify(error='Unable to delete the item. Please try again.'), 500
    finally:
        if conn is not None:
            conn.close()
