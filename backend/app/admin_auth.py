"""Server-verified administrator sessions for receiving management."""
import hashlib
import secrets
from functools import wraps

from flask import current_app, g, jsonify, request
from itsdangerous import URLSafeTimedSerializer


def session_token(username, password_hash):
    return URLSafeTimedSerializer(current_app.config['SECRET_KEY'], salt='rma-login').dumps({
        'username': username, 'version': hashlib.sha256(password_hash.encode()).hexdigest(), 'nonce': secrets.token_hex(16),
    })


def admin_required(fn):
    @wraps(fn)
    def wrapped(*args, **kwargs):
        from app.permissions import current_session
        account = current_session()
        if not account:
            return jsonify(error='Please log in again to use admin controls.'), 401
        if account['role'] != 'admin':
            return jsonify(error='Only an admin can perform this action.'), 403
        g.admin_username = account['username']
        return fn(*args, **kwargs)
    return wrapped
