from flask import Blueprint, jsonify, request
from app.admin_auth import admin_required
from app.models import db_connection
from app.permissions import PERMISSIONS, department_names
from app.routes.return_units import api, text
from app.routes.receiving_admin import audit

department_admin_bp = Blueprint('department_admin', __name__)


def departments_payload(cursor):
    names = department_names(cursor)
    cursor.execute('SELECT department, permission FROM RMA_department_permissions')
    assignments = {}
    for department, permission in cursor.fetchall():
        assignments.setdefault(department, []).append(permission)
    return dict(departments=[dict(name=name, permissions=assignments.get(name, [])) for name in names],
                catalog=list(PERMISSIONS.values()))


@department_admin_bp.route('/admin/departments', methods=['GET', 'POST', 'PATCH', 'DELETE'])
@api
@admin_required
def manage_departments():
    payload = request.get_json(silent=True) or {}
    with db_connection() as conn:
        cursor = conn.cursor()
        if request.method == 'GET': return jsonify(departments_payload(cursor))
        name = text(payload, 'name')
        if not name: raise ValueError('Enter a department name.')
        cursor.execute('SELECT name FROM RMA_departments WITH (UPDLOCK, HOLDLOCK) WHERE LOWER(name) = LOWER(?)', name)
        found = cursor.fetchone()
        if request.method == 'POST':
            if found: return jsonify(error='This department already exists.'), 409
            cursor.execute('INSERT INTO RMA_departments (name) VALUES (?)', name)
            audit(cursor, 'add department', name, {})
        else:
            if not found: return jsonify(error='Department not found.'), 404
            name = found[0]
            if request.method == 'DELETE':
                cursor.execute('SELECT COUNT(*) FROM RMA_users WHERE department = ?', name)
                if cursor.fetchone()[0]: raise ValueError('Move accounts to another department before removing this department.')
                cursor.execute('DELETE FROM RMA_department_permissions WHERE department = ?', name)
                cursor.execute('DELETE FROM RMA_departments WHERE name = ?', name)
                audit(cursor, 'remove department', name, {})
            else:
                renamed = text(payload, 'newName') or name
                if renamed.casefold() != name.casefold():
                    cursor.execute('SELECT name FROM RMA_departments WHERE LOWER(name) = LOWER(?)', renamed)
                    if cursor.fetchone(): return jsonify(error='This department already exists.'), 409
                actions = payload.get('permissions')
                if not isinstance(actions, list) or any(not isinstance(action, str) or action not in PERMISSIONS for action in actions):
                    raise ValueError('Choose valid permissions for this department.')
                actions = set(actions)
                for action in list(actions):
                    if action != 'directory.view':
                        view = action.split('.')[0] + '.view'
                        if view in PERMISSIONS: actions.add(view)
                cursor.execute('SELECT permission FROM RMA_department_permissions WHERE department = ?', name)
                old_actions = [row[0] for row in cursor.fetchall()]
                # Delete before rename so this works on SQLite and SQL Server alike.
                cursor.execute('DELETE FROM RMA_department_permissions WHERE department = ?', name)
                cursor.execute('UPDATE RMA_departments SET name = ? WHERE name = ?', renamed, name)
                cursor.execute('UPDATE RMA_users SET department = ? WHERE department = ?', renamed, name)
                for action in set(actions):
                    cursor.execute('INSERT INTO RMA_department_permissions (department, permission) VALUES (?, ?)', renamed, action)
                audit(cursor, 'update department permissions', name, {'newName': renamed, 'before': old_actions, 'after': sorted(set(actions))})
        result = departments_payload(cursor)
    return jsonify(**result, message='Departments and permissions updated. Existing sessions use the new permissions immediately.')
