# app/routes/main_routes.py
from flask import Blueprint, jsonify, request
from werkzeug.security import generate_password_hash, check_password_hash
from app.models import get_db_connection

auth_bp = Blueprint('auth', __name__)

@auth_bp.route('/api/login', methods=['POST'])
def login():
    data = request.json
    username = data.get('username')
    password = data.get('password')

    if not username or not password:
        return jsonify({'error': 'Username and password are required.'}), 400

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT password_hash, role, department
        FROM RMA_users
        WHERE username = ?
    """, (username,))
    user = cursor.fetchone()
    conn.close()

    if user and check_password_hash(user[0], password):
        return jsonify({
            'message': 'Login successful',
            'role': user[1],
            'department': user[2],
            'username': username
        })
    else:
        return jsonify({'error': 'Invalid credentials'}), 401
    
@auth_bp.route('/api/register', methods=['POST'])
def register():
    data = request.json
    username = data.get('username')
    password = data.get('password')
    role = data.get('role', 'normal')
    department = data.get('department')

    if not username or not password or not department:
        return jsonify({"error": "Missing fields"}), 400

    password_hash = generate_password_hash(password)

    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("INSERT INTO RMA_users (username, password_hash, role, department) VALUES (?, ?, ?, ?)", (username, password_hash, role, department))
        conn.commit()
    except:
        return jsonify({"error": "Username already exists"}), 400
    finally:
        conn.close()

    return jsonify({"message": "User registered successfully"})


@auth_bp.route('/api/users', methods=['GET'])
def get_users():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM RMA_users")
        data = cursor.fetchall()
        conn.close()

        results = [row[1] for row in data]
        return jsonify(results)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@auth_bp.route('/api/current-user', methods=['POST'])
def get_current_user():
    data = request.json
    role = data.get('role')
    department = data.get('department')
    
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT username
        FROM RMA_users
        WHERE role = ? AND department = ?
        LIMIT 1
    """, (role, department))
    user = cursor.fetchone()
    conn.close()
    
    if user:
        return jsonify({'username': user[0]})
    else:
        return jsonify({'username': 'Unknown User'})

