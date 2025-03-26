from flask import Blueprint, render_template, request, redirect
from app.models import get_db_connection

non_laptop_bp = Blueprint('non_laptop', __name__)

@non_laptop_bp.route('/', methods=['GET', 'POST'])
def show_RMA_non_laptop_sheet():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM RMA_non_laptop_sheet")
        
        data = cursor.fetchall()
        columns = [column[0] for column in cursor.description]
        results = [dict(zip(columns, row)) for row in data]
        conn.close()
        return render_template('non_laptop/non_laptop.html', items=results)
    except Exception as e:
        return f"Error: {str(e)}"