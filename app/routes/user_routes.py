# app/routes/user_routes.py
from flask import Blueprint, render_template, request, redirect, url_for
from app.models import get_db_connection

user_bp = Blueprint('user', __name__)

@user_bp.route('/', methods=['GET', 'POST'])
def show_user_page():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        # Handle form submission
        if request.method == 'POST':
            action = request.form.get('action')
            
            if action == 'update':
                username = request.form.get('username')
                new_username = request.form.get('new_username')
                role = request.form.get('role')
                cursor.execute(
                    "UPDATE RMA_user SET Name = ?, Role = ? WHERE Name = ?",
                    (new_username, role, username)
                )
            elif action == 'add':
                new_username = request.form.get('new_username')
                role = request.form.get('role')
                cursor.execute(
                    "INSERT INTO RMA_user (Name, Role) VALUES (?, ?)",
                    (new_username, role)
                )
            elif action == 'delete':
                username = request.form.get('username')
                cursor.execute("DELETE FROM RMA_user WHERE Name = ?", (username,))

            conn.commit()

        # Fetch all users to display
        cursor.execute("SELECT * FROM RMA_user")
        data = cursor.fetchall()
        results = [dict(zip([column[0] for column in cursor.description], row)) for row in data]
        conn.close()
        return render_template('user.html', results=results)
    except Exception as e:
        return f"Error: {str(e)}", 500