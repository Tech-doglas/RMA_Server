"""Browser boundaries and bounded authentication throttling, without external services."""
import math
import threading
import time
from collections import OrderedDict, deque
from urllib.parse import urlsplit

from flask import current_app, jsonify, request


class AttemptLimiter:
    def __init__(self):
        self.entries = OrderedDict()
        self.lock = threading.Lock()

    def check(self, key, limit, window, record=False):
        now = time.monotonic()
        with self.lock:
            while self.entries and len(self.entries) >= 8192 and key not in self.entries:
                self.entries.popitem(last=False)
            hits = self.entries.setdefault(key, deque())
            while hits and hits[0] <= now - window:
                hits.popleft()
            self.entries.move_to_end(key)
            if len(hits) >= limit:
                return max(1, math.ceil(window - (now - hits[0])))
            if record:
                hits.append(now)
            return 0

    def clear(self, key):
        with self.lock:
            self.entries.pop(key, None)


def throttle_response(seconds):
    response = jsonify(error='Too many attempts. Please wait a few minutes before trying again.', retryAfter=seconds)
    response.status_code = 429
    response.headers['Retry-After'] = str(seconds)
    return response


def trusted_origin(origin):
    if not origin or origin == 'null':
        return False
    if origin in current_app.config.get('TRUSTED_ORIGINS', []):
        return True
    try:
        source, server = urlsplit(origin), urlsplit(request.host_url)
        return (source.scheme in ('http', 'https') and source.scheme == server.scheme
                and source.hostname == server.hostname and not source.username and not source.password
                and not source.path and not source.query and not source.fragment
                and source.port in (server.port or (443 if server.scheme == 'https' else 80), 3000))
    except ValueError:
        return False


def browser_boundary():
    origin = request.headers.get('Origin')
    if origin and not trusted_origin(origin):
        return jsonify(error='This website is not allowed to access the server.'), 403
    if not origin and request.headers.get('Sec-Fetch-Site') == 'cross-site':
        return jsonify(error='Cross-site requests are not allowed.'), 403
    if request.is_json and request.content_length and request.content_length > 2 * 1024 * 1024:
        return jsonify(error='The request is too large. Submit fewer records at once.'), 413
    if request.is_json and not isinstance(request.get_json(silent=True), dict):
        return jsonify(error='Send a valid JSON object with the request fields.'), 400
    if request.method == 'OPTIONS':
        return '', 204


def security_headers(response):
    origin = request.headers.get('Origin')
    if origin and trusted_origin(origin):
        response.headers['Access-Control-Allow-Origin'] = origin
        response.headers['Access-Control-Allow-Credentials'] = 'true'
        response.headers['Access-Control-Allow-Headers'] = 'Authorization, Content-Type, X-Requested-With'
        response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, PATCH, DELETE, OPTIONS'
        response.headers['Access-Control-Expose-Headers'] = 'Retry-After, Content-Disposition'
        response.vary.add('Origin')
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['Referrer-Policy'] = 'same-origin'
    response.headers['Cache-Control'] = 'no-store'
    if request.is_secure:
        response.headers['Strict-Transport-Security'] = 'max-age=31536000'
    return response
