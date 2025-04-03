import os
from flask import Blueprint, render_template, request, redirect, send_from_directory, url_for
from app.models import get_db_connection, get_modi_rma_root, get_shipping_label_image, save_shipping_label_image

return_receiving_bp = Blueprint('return_receiving', __name__)

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
        total_count = len(results)
        conn.close()

        return render_template('return_receiving/return_receiving.html', records=results, total_count=total_count)
    except Exception as e:
        return f"Error: {str(e)}"

@return_receiving_bp.route('/return_receiving_input')
def return_receiving_input():
    try:
        return render_template('return_receiving/return_receiving_input.html')
    except Exception as e:
        return f"Error: {str(e)}"
    
@return_receiving_bp.route('/detail/<tracking_number>')
def return_receiving_record_detail(tracking_number):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM RMA_return_receiving WHERE TrackingNumber = ?", tracking_number)
        data = cursor.fetchone()
        if not data:
            return "Record not found", 404
        record = dict(zip([column[0] for column in cursor.description], data))
        image = get_shipping_label_image(record['TrackingNumber'])
        conn.close()
        return render_template('return_receiving/return_receiving_record_detail.html', record=record, image=image)
    except Exception as e:
        return f"Error: {str(e)}", 500
    
@return_receiving_bp.route('/submit', methods=['POST'])
def submit_record():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        tracking_number = request.form.get('tracking_number')
        company = request.form.get('company')
        remark = request.form.get('remark')

        cursor.execute("""
            INSERT INTO RMA_return_receiving (TrackingNumber, Company, Remark) 
            VALUES (?, ?, ?)
        """, (tracking_number, company, remark))
        
        save_shipping_label_image(request.files.get('image'), tracking_number)
        conn.commit()
        conn.close()
        return redirect(url_for('return_receiving.return_receiving_input'))
    except Exception as e:
        return f"Error submitting record: {str(e)}"

@return_receiving_bp.route('/images/return_receiving/<filename>')
def serve_image(filename):
    try:
        image_dir = os.path.join(get_modi_rma_root(), 'images', 'return_receiving')
        if not os.path.exists(image_dir):
            return "Image directory not found", 404
        return send_from_directory(image_dir, filename)
    except Exception as e:
        return f"Error: {str(e)}", 500
    
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