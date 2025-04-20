import os
from flask import Blueprint, render_template, request, redirect, send_from_directory, url_for, jsonify
from app.models import get_db_connection, get_modi_rma_root, get_shipping_label_image, save_shipping_label_image

return_receiving_bp = Blueprint('return', __name__)

@return_receiving_bp.route('/', methods=['GET', 'POST'])
def show_return_receiving_sheet():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        if request.method == 'POST':
            tracking_number = request.form.get('tracking_number', '').strip()
            company = request.form.get('company', '').strip()
            record_date = request.form.get('record_date', '').strip()
            recorded = request.form.get('recorded', '')

            query = "SELECT * FROM RMA_return_receiving WHERE 1=1"
            params = []

            if tracking_number:
                query += " AND TrackingNumber LIKE ?"
                params.append(f"%{tracking_number}%")
            if company:
                query += " AND Company = ?"
                params.append(company)
            if record_date:
                query += " AND CONVERT(DATE, CreationDateTime) = ?"
                params.append(record_date)
            if recorded:
                if recorded == "recorded":
                    query += " AND Recorded = ?"
                    params.append(1)
                else:
                    query += " AND Recorded = ?"
                    params.append(0)
            query += " ORDER BY CreationDateTime DESC"
            cursor.execute(query, params) if params else cursor.execute("SELECT * FROM RMA_return_receiving ORDER BY CreationDateTime DESC")
        else:
            cursor.execute("SELECT * FROM RMA_return_receiving ORDER BY CreationDateTime DESC")

        data = cursor.fetchall()
        columns = [column[0] for column in cursor.description]
        results = [dict(zip(columns, row)) for row in data]
        conn.close()
        return jsonify(results)
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    
@return_receiving_bp.route('/api/return/<tracking_number>', methods=['GET'])
def api_get_return_receiving_detail(tracking_number):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM RMA_return_receiving WHERE TrackingNumber = ?", tracking_number)
        row = cursor.fetchone()
        if not row:
            return jsonify({"error": "Not found"}), 404

        columns = [col[0] for col in cursor.description]
        record = dict(zip(columns, row))
        conn.close()
        return jsonify(record)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    
@return_receiving_bp.route('/submit', methods=['POST'])
def submit_record():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        tracking_number = request.form.get('tracking_number')
        company = request.form.get('company')
        remark = request.form.get('remark')

        cursor.execute("""
            IF EXISTS (SELECT 1 FROM RMA_return_receiving WHERE TrackingNumber = ?)  
            BEGIN  
                UPDATE RMA_return_receiving   
                SET Company = ?, Remark = ?
                WHERE TrackingNumber = ?;  
            END  
            ELSE  
            BEGIN  
                INSERT INTO RMA_return_receiving (TrackingNumber, Company, Remark) 
                VALUES (?, ?, ?)
            END  
        """, (tracking_number, company, remark, tracking_number, tracking_number, company, remark))
        save_shipping_label_image(request.files.get('image'), tracking_number)
        conn.commit()
        conn.close()
        return "OK", 200
    except Exception as e:
        return f"Error submitting record: {str(e)}"

@return_receiving_bp.route('/images/return/<filename>')
def serve_image(filename):
    try:
        image_dir = os.path.join(get_modi_rma_root(), 'images', 'return_receiving')
        if not os.path.exists(image_dir):
            return "Image directory not found", 404
        return send_from_directory(image_dir, filename)
    except Exception as e:
        return f"Error: {str(e)}", 500
    
@return_receiving_bp.route('/api/images/<tracking_number>')
def list_return_images(tracking_number):
    try:
        img_dir = get_shipping_label_image(tracking_number)
        if not os.path.exists(img_dir):
            return jsonify([])

        filenames = os.listdir(img_dir)
        image_urls = filenames

        return jsonify(image_urls)
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    
@return_receiving_bp.route('/recorded/<tracking_number>')
def mark_recorded(tracking_number):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("UPDATE RMA_return_receiving SET Recorded = 1 WHERE TrackingNumber = ?", (tracking_number,))
        conn.commit()
        conn.close()
        return redirect(url_for('return_receiving.return_receiving_record_detail', tracking_number=tracking_number))
    except Exception as e:
        return f"Error updating Recorded: {str(e)}", 500