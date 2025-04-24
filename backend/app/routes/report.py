# app/routes/report.py
from flask import Blueprint, request, jsonify, make_response, send_file
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from openpyxl import Workbook
from io import BytesIO
from collections import defaultdict
from app.models import get_db_connection

report_bp = Blueprint('report', __name__)

@report_bp.route('/laptop_TRP', methods=['GET'])
def laptop_TRP():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute("SELECT InputDate, TechDoneDate FROM RMA_laptop_sheet")
        rows = cursor.fetchall()
        conn.close()

        input_date_group = defaultdict(int) #all laptop
        quickcheck_date_group = defaultdict(int) #quick check

        for row in rows:
            input_date, quickcheck_date = row

            if input_date:
                input_month = input_date.strftime('%Y-%m')
                input_date_group[input_month] += 1
                
            if quickcheck_date:
                tech_month = quickcheck_date.strftime('%Y-%m')
                quickcheck_date_group[tech_month] += 1
        
        # all laptop = included sealed and not sealed
        # quick check = only sealed laptop
        final_result = {
            key: input_date_group[key] - quickcheck_date_group.get(key, 0)
            for key in input_date_group
        }
        
        data = {
            'Full_qty': dict(final_result),
            'Quick_check_qty': dict(quickcheck_date_group)
        }
        
        # Create PDF in memory
        buffer = BytesIO()
        p = canvas.Canvas(buffer, pagesize=letter)
        width, height = letter

        p.setFont("Helvetica", 14)
        p.drawString(100, height - 50, "TRP Monthly Report")

        y = height - 100
        p.setFont("Helvetica", 12)

        # Draw Full_qty section
        p.drawString(50, y, "Full_qty:")
        y -= 20
        for month, qty in data["Full_qty"].items():
            p.drawString(70, y, f"{month}: {qty}")
            y -= 20

        y -= 10
        p.drawString(50, y, "Quick_check_qty:")
        y -= 20
        for month, qty in data["Quick_check_qty"].items():
            p.drawString(70, y, f"{month}: {qty}")
            y -= 20

        p.showPage()
        p.save()

        buffer.seek(0)

        # Send as response
        response = make_response(buffer.read())
        response.headers['Content-Type'] = 'application/pdf'
        response.headers['Content-Disposition'] = 'attachment; filename=trp_report.pdf'
        return response
    except Exception as e:
        return f"Error: {str(e)}"