"""Department permissions, checked against the current account on every request."""
import hashlib
import time
from flask import current_app, g, jsonify, request
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from app.models import db_connection

GROUPS = {
    '3PL': {'return.view': 'View returns and photos', 'return.receive': 'Receive deliveries',
            'return.photos': 'Add unit photos', 'return.inspect': 'Inspect units and assign pallets',
            'return.classify': 'Change bulk classification', 'return.pallet_view': 'View pallets and shipment details',
            'return.pallet_status': 'Lock, fill, and reopen pallets',
            'return.ship': 'Ship units', 'return.report': 'View monthly reports',
            'return.edit': 'Edit return records', 'return.delete': 'Remove return records',
            'return.restore': 'Restore removed records', 'return.export': 'Export return records', 'return.print': 'Print file labels and records'},
    'PC inventory': {'pc.view': 'View inventory and photos', 'pc.create': 'Create inventory records',
                     'pc.edit': 'Edit inventory records', 'pc.delete': 'Delete inventory records',
                     'pc.photos': 'Upload or remove photos', 'pc.inspect': 'Mark technical work complete',
                     'pc.sell': 'Record sales', 'pc.report': 'Export inventory reports'},
    'Non-PC inventory': {'nonpc.view': 'View inventory and photos', 'nonpc.create': 'Create inventory records',
                         'nonpc.edit': 'Edit inventory records', 'nonpc.delete': 'Delete inventory records',
                         'nonpc.photos': 'Upload or remove photos', 'nonpc.request': 'Set inspection requests',
                         'nonpc.ready': 'Mark ready for sale', 'nonpc.sell': 'Record sales',
                         'nonpc.distribute': 'Mark orders distributed'},
    'Previous receiving / SnowBell': {'legacy.view': 'View previous receiving records',
                                     'legacy.create': 'Create previous receiving records',
                                     'legacy.edit': 'Edit / record previous receiving records',
                                     'legacy.photos': 'Upload or remove previous receiving photos',
                                     'xie.view': 'View SnowBell records', 'xie.create': 'Create SnowBell records',
                                     'xie.edit': 'Update SnowBell records', 'xie.request': 'Submit SnowBell requests', 'xie.photos': 'Upload SnowBell photos'},
    'Staff directory': {'directory.view': 'View staff names for record attribution'},
}
PERMISSIONS = {key: {'key': key, 'label': label, 'group': group}
               for group, actions in GROUPS.items() for key, label in actions.items()}
DEFAULT_DEPARTMENTS = ['IT', 'Tech', 'SnowBell', 'Accounting', 'Sale', 'Warehouse']


def default_permissions(department):
    # These actions previously required an administrator; staff get them only by explicit grant.
    operational = [key for key in PERMISSIONS if key not in ('return.edit', 'return.delete', 'return.restore', 'return.export')]
    if department in ['IT', 'Tech', 'Accounting', 'Sale', 'Warehouse']:
        return operational
    if department == 'SnowBell':
        return [key for key in operational if not key.startswith(('pc.', 'nonpc.'))]
    return []


def department_names(cursor):
    cursor.execute('SELECT name FROM RMA_departments ORDER BY name')
    return [row[0] for row in cursor.fetchall()]


def account_permissions(cursor, role, department):
    if role == 'admin':
        return list(PERMISSIONS)
    cursor.execute('SELECT permission FROM RMA_department_permissions WHERE department = ?', department)
    return [row[0] for row in cursor.fetchall() if row[0] in PERMISSIONS]


def current_session():
    if hasattr(g, 'session_account'):
        return g.session_account
    token = request.headers.get('Authorization', '').removeprefix('Bearer ')
    if not request.headers.get('Authorization'):
        token = request.cookies.get('rma_session', '')
    try:
        session = URLSafeTimedSerializer(current_app.config['SECRET_KEY'], salt='rma-login').loads(token, max_age=43200)
    except (BadSignature, SignatureExpired):
        return None
    if not isinstance(session, dict):
        return None
    with db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT token_hash FROM RMA_revoked_sessions WHERE token_hash = ? AND expires_at > ?', hashlib.sha256(token.encode()).hexdigest(), int(time.time()))
        if cursor.fetchone():
            return None
        cursor.execute('SELECT username, role, department, password_hash, isActive, approvalStatus FROM RMA_users WHERE username = ?', session.get('username', ''))
        user = cursor.fetchone()
        if not user or not user[4] or user[5] != 'approved' or session.get('version') != hashlib.sha256(user[3].encode()).hexdigest():
            return None
        g.session_account = dict(username=user[0], role=user[1], department=user[2],
                                 permissions=account_permissions(cursor, user[1], user[2]))
    return g.session_account


def required_permission():
    endpoint = request.endpoint or ''
    name = endpoint.rsplit('.', 1)[-1]
    if endpoint.startswith(('receiving_admin.', 'department_admin.')):
        # Account/settings administration stays reserved for administrators.
        if name == 'manage_unit':
            return 'return.delete' if request.method == 'DELETE' else 'return.edit'
        if name == 'search_records': return 'return.view'
        if name == 'bulk_update':
            return {'remove': 'return.delete', 'pallet': 'return.inspect', 'type': 'return.classify'}.get((request.get_json(silent=True) or {}).get('action'), 'return.edit')
        if name in ('restore_record', 'removed_records'): return 'return.restore'
        if name == 'export_records': return 'return.export'
        return 'admin'
    if endpoint.startswith('return_units.'):
        return {'companies': 'return.view', 'list_units': 'return.view', 'detail': 'return.view',
                'receive_units': 'return.receive', 'add_unit_photos': 'return.photos', 'inspect': 'return.inspect',
                'bulk_type': 'return.classify', 'pallets': 'return.pallet_view', 'change_pallet_status': 'return.pallet_status',
                'ship': 'return.ship', 'monthly_report': 'return.report'}.get(name)
    if endpoint.startswith('laptop.'):
        return {'api_search_laptops': 'pc.view', 'laptop_item_detail_api': 'pc.view', 'sales_detail': 'pc.sell',
                'submit_item': 'pc.create', 'edit_laptop': 'pc.edit', 'update_item': 'pc.edit',
                'delete_item': 'pc.delete', 'mark_tech_done': 'pc.inspect', 'sales_order': 'pc.sell'}.get(name)
    if endpoint.startswith('non_laptop.'):
        return {'api_nonlaptop_search': 'nonpc.view', 'get_non_laptop_item': 'nonpc.view',
                'submit_item': 'nonpc.create', 'api_update_item': 'nonpc.edit', 'delete_item': 'nonpc.delete',
                'api_update_request': 'nonpc.request', 'api_tracking_number': 'nonpc.create',
                'api_sale_ready': 'nonpc.ready', 'mark_order_distributed': 'nonpc.distribute', 'sales_order': 'nonpc.sell'}.get(name)
    if endpoint.startswith('return.'):
        return {'show_return_receiving_sheet': 'legacy.view', 'api_get_return_receiving_detail': 'legacy.view',
                'submit_record': 'legacy.create', 'mark_recorded': 'legacy.edit', 'update_code': 'legacy.edit',
                'edit_tracking': 'legacy.edit'}.get(name)
    if endpoint.startswith('xie.'):
        return {'api_search_xie_laptops': 'xie.view', 'get_items_by_tracking': 'xie.view', 'get_return_number': 'xie.create',
                'insert_xie_item': 'xie.create', 'update_xie_item': 'xie.edit', 'api_request': 'xie.request'}.get(name)
    if endpoint.startswith('report.'): return 'pc.report'
    if endpoint.startswith('images.'):
        scope = {'laptop': 'pc', 'non_laptop': 'nonpc', 'return_units': 'return', 'return_receiving': 'legacy'}.get((request.view_args or {}).get('type'))
        return scope + ('.photos' if name == 'delete_image' else '.view') if scope else None
    if endpoint.startswith('auth.'):
        return 'directory.view' if name == 'get_users' else 'session'
    return None


def enforce_permissions():
    if request.method == 'OPTIONS' or not request.endpoint or request.endpoint == 'static':
        return
    if request.endpoint in ('auth.login', 'auth.register', 'auth.departments', 'auth.logout'):
        return
    user = current_session()
    if not user:
        return jsonify(error='Please log in to use this action.'), 401
    action = required_permission()
    g.admin_username = user['username']
    if action == 'session' or user['role'] == 'admin':
        return
    shared_image_access = request.endpoint.startswith('images.') and action == 'legacy.view' and 'xie.view' in user['permissions']
    # Existing shipping and pallet managers retain access without broadening their action grants.
    pallet_access = action == 'return.pallet_view' and any(key in user['permissions'] for key in ('return.ship', 'return.pallet_status'))
    if not action or action == 'admin' or (action not in user['permissions'] and not shared_image_access and not pallet_access):
        return jsonify(error='Your department does not have permission for this action. Contact an admin.', permission=action), 403
    if request.files and request.endpoint.startswith(('laptop.', 'non_laptop.', 'return.', 'xie.', 'return_units.')):
        scope = 'pc' if request.endpoint.startswith('laptop.') else 'nonpc' if request.endpoint.startswith('non_laptop.') else 'xie' if request.endpoint.startswith('xie.') else 'return' if request.endpoint.startswith('return_units.') else 'legacy'
        if any(file.filename for _, file in request.files.items(multi=True)) and scope + '.photos' not in user['permissions']:
            return jsonify(error='Your department does not have permission to upload photos.', permission=scope + '.photos'), 403


def require_action(action):
    user = current_session()
    if not user or (user['role'] != 'admin' and action not in user['permissions']):
        raise PermissionError('Your department does not have permission for ' + PERMISSIONS[action]['label'].lower() + '.')
