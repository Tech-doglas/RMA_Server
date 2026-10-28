# app/routes/main_routes.py
import hashlib
import time
from flask import Blueprint, current_app, jsonify, request
from werkzeug.security import generate_password_hash, check_password_hash
from app.models import get_db_connection
from app.models import db_connection
from app.admin_auth import session_token
from app.permissions import account_permissions, current_session, department_names
from app.security import throttle_response
import pyodbc
import sqlite3

auth_bp = Blueprint('auth', __name__)
_DUMMY_HASH = generate_password_hash('unused-account-timing-check')


def credentials():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return None
    username, password = data.get('username'), data.get('password')
    if not isinstance(username, str) or not isinstance(password, str):
        return None
    username = username.strip()
    if not 1 <= len(username) <= 255 or not 1 <= len(password) <= 255:
        return None
    return data, username, password

@auth_bp.route('/api/login', methods=['POST'])
def login():
    parsed = credentials()
    if parsed is None:
        return jsonify(error='Enter a username and password (up to 255 characters each).'), 400
    _, username, password = parsed
    limiter = current_app.extensions['auth_limiter']
    address = request.remote_addr or 'unknown'
    keys = [(('login-account', address, username.casefold()), 8, 600), (('login-ip', address), 60, 900)]
    for key, limit, window in keys:
        retry = limiter.check(key, limit, window)
        if retry:
            return throttle_response(retry)

    with db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT password_hash, role, department, isActive, approvalStatus
            FROM RMA_users
            WHERE username = ?
        """, (username,))
        user = cursor.fetchone()

    password_matches = check_password_hash(user[0] if user else _DUMMY_HASH, password)
    if user and user[3] and password_matches:
        limiter.clear(keys[0][0])
        if user[4] != 'approved':
            return jsonify(error='Your registration is waiting for admin approval.' if user[4] == 'pending' else 'Your registration was declined. Contact an admin.'), 403
        with db_connection() as conn:
            permissions = account_permissions(conn.cursor(), user[1], user[2])
        token = session_token(username, user[0])
        response = jsonify({
            'message': 'Login successful',
            'role': user[1],
            'department': user[2],
            'username': username,
            'token': token, 'permissions': permissions
        })
        response.set_cookie('rma_session', token, httponly=True, samesite='Strict', secure=request.is_secure, max_age=43200)
        return response
    else:
        for key, limit, window in keys:
            limiter.check(key, limit, window, record=True)
        return jsonify({'error': 'Invalid credentials'}), 401
    
@auth_bp.route('/api/register', methods=['POST'])
def register():
    parsed = credentials()
    if parsed is None:
        return jsonify(error='Enter a username (up to 255 characters), password, and department.'), 400
    data, username, password = parsed
    role = data.get('role', 'normal')
    if role not in ('normal', 'manager'):
        return jsonify(error='Admin accounts must be created by the system administrator.'), 403
    # Staff cannot choose their own elevated role or approval state.
    role = 'normal'
    department = data.get('department')

    if not isinstance(department, str) or not department:
        return jsonify({"error": "Missing fields"}), 400
    if len(password) < 12:
        return jsonify(error='Use a password with 12–255 characters.'), 400
    limiter = current_app.extensions['auth_limiter']
    retry = limiter.check(('register', request.remote_addr), 10, 3600, record=True)
    if retry:
        return throttle_response(retry)

    try:
        with db_connection() as conn:
            cursor = conn.cursor()
            # Registration cannot enumerate or self-select customer/internal access.
            department = 'Pending assignment'
            cursor.execute('SELECT name FROM RMA_departments WITH (UPDLOCK, HOLDLOCK) WHERE name = ?', department)
            if not cursor.fetchone():
                cursor.execute('INSERT INTO RMA_departments (name) VALUES (?)', department)
            password_hash = generate_password_hash(password)
            cursor.execute("INSERT INTO RMA_users (username, password_hash, role, department, approvalStatus) VALUES (?, ?, ?, ?, ?)", (username, password_hash, role, department, 'pending'))
    except (pyodbc.IntegrityError, sqlite3.IntegrityError):
        return jsonify({"error": "Username already exists"}), 409

    return jsonify(message='Registration submitted. An admin must approve your account before you can log in.', approvalStatus='pending')


@auth_bp.route('/api/departments', methods=['GET'])
def departments():
    user = current_session()
    if not user:
        return jsonify(departments=['Pending assignment'])
    if user['role'] != 'admin':
        return jsonify(departments=[user['department']])
    with db_connection() as conn:
        return jsonify(departments=department_names(conn.cursor()))


@auth_bp.route('/api/session', methods=['GET'])
def session_details():
    response = jsonify(current_session())
    token = request.headers.get('Authorization', '').removeprefix('Bearer ') or request.cookies.get('rma_session', '')
    response.set_cookie('rma_session', token, httponly=True, samesite='Strict', secure=request.is_secure, max_age=43200)
    return response


@auth_bp.route('/api/logout', methods=['POST'])
def logout():
    # Revoke the actual signed token, including copies kept outside this browser.
    if current_session():
        token = request.headers.get('Authorization', '').removeprefix('Bearer ') or request.cookies.get('rma_session', '')
        digest = hashlib.sha256(token.encode()).hexdigest()
        with db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('DELETE FROM RMA_revoked_sessions WHERE expires_at <= ?', int(time.time()))
            cursor.execute('SELECT token_hash FROM RMA_revoked_sessions WHERE token_hash = ?', digest)
            if not cursor.fetchone():
                cursor.execute('INSERT INTO RMA_revoked_sessions (token_hash, expires_at) VALUES (?, ?)', digest, int(time.time()) + 43200)
    response = jsonify(message='Logged out.')
    response.delete_cookie('rma_session')
    return response


@auth_bp.route('/api/users', methods=['GET'])
def get_users():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT username FROM RMA_users WHERE isActive = 1 AND approvalStatus = 'approved' ORDER BY username")
        data = cursor.fetchall()
        conn.close()

        results = [row[0] for row in data]
        return jsonify(results)
    except Exception as e:
        current_app.logger.exception('Staff directory could not be loaded')
        return jsonify(error='Unable to load staff names. Please try again.'), 503

@auth_bp.route('/api/current-user', methods=['POST'])
def get_current_user():
    return jsonify(username=current_session()['username'])
