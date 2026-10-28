# app/__init__.py
import logging
from logging.handlers import RotatingFileHandler
import os
import time
import sqlite3
import secrets

from flask import Flask, request, g, jsonify
from werkzeug.exceptions import HTTPException, ServiceUnavailable
import pyodbc
from config import Config


def create_app(test_config=None):
    app = Flask(__name__)
    from app.security import AttemptLimiter, browser_boundary, security_headers
    app.config.update(MAX_CONTENT_LENGTH=64 * 1024 * 1024,
                      TRUSTED_ORIGINS=[value.strip().rstrip('/') for value in os.environ.get('RMA_TRUSTED_ORIGINS', '').split(',') if value.strip()])
    app.extensions['auth_limiter'] = AttemptLimiter()
    app.before_request(browser_boundary)
    app.after_request(security_headers)

    @app.errorhandler(HTTPException)
    def http_error(error):
        message = 'The upload is too large. Use smaller photos or fewer files.' if error.code == 413 else error.description
        return jsonify(error=message), error.code

    @app.errorhandler(Exception)
    def unexpected_error(error):
        app.logger.exception('Request failed')
        return jsonify(error='Unable to complete this request. Please try again or contact an admin.'), 500

    @app.errorhandler(ServiceUnavailable)
    def database_unavailable(error):
        return jsonify(error=error.description), 503

    @app.errorhandler(pyodbc.Error)
    @app.errorhandler(sqlite3.DatabaseError)
    def database_query_failed(error):
        app.logger.error('Database query failed (ODBC state %s)', error.args[0] if error.args else 'unknown')
        return jsonify(error='Unable to access the database. Check the database connection and required tables.'), 503

    # --- Logging setup ---
    log_formatter = logging.Formatter(
        '%(asctime)s %(levelname)s: %(message)s'
    )

    # Stdout handler (for Docker logs)
    stream_handler = logging.StreamHandler()
    stream_handler.setFormatter(log_formatter)
    stream_handler.setLevel(logging.INFO)
    app.logger.addHandler(stream_handler)

    # File handler (for direct access)
    log_dir = os.environ.get('RMA_LOG_DIR',
        os.path.join(os.path.dirname(app.root_path), 'logs') if os.name == 'nt' else '/logs')
    os.makedirs(log_dir, exist_ok=True)
    file_handler = RotatingFileHandler(
        os.path.join(log_dir, 'rma_server.log'),
        maxBytes=10 * 1024 * 1024,  # 10 MB
        backupCount=5
    )
    file_handler.setFormatter(log_formatter)
    file_handler.setLevel(logging.INFO)
    app.logger.addHandler(file_handler)

    app.logger.setLevel(logging.INFO)

    @app.before_request
    def log_request_start():
        g.start_time = time.time()

    @app.after_request
    def log_request_end(response):
        duration = (time.time() - getattr(g, 'start_time', time.time())) * 1000
        msg = '%s %s %s %.0fms | IP: %s'
        args = (
            request.method, request.path, response.status_code,
            duration, request.remote_addr
        )

        if response.status_code >= 500:
            app.logger.error(msg, *args)
        else:
            app.logger.info(msg, *args)

        return response

    # Database connection string
    app.config['SQL_DRIVER'] = Config.DRIVER
    app.config['CONN_STR'] = (
        f"DRIVER={Config.DRIVER};"
        f"SERVER={Config.SQL_SERVER};"
        f"DATABASE={Config.DATABASE};"
        f"UID={Config.UID};"
        f"PWD={Config.PWD};"
        f"TrustServerCertificate={Config.TRUST_CERT};"
    )

    app.config['MODI_RMA_DIR'] = os.environ.get('MODI_RMA_DIR',
        os.path.join(os.path.dirname(app.root_path), 'storage') if os.name == 'nt' else Config.MODI_RMA_DIR)

    app.config['DATABASE_BACKEND'] = os.environ.get('DATABASE_BACKEND', 'sqlite' if os.name == 'nt' else 'mssql').lower()
    app.config['SQLITE_PATH'] = os.environ.get('SQLITE_PATH', os.path.join(app.config['MODI_RMA_DIR'], 'rma.sqlite3'))
    if test_config:
        app.config.update(test_config)
    if app.config['DATABASE_BACKEND'] == 'sqlite':
        from app.local_database import initialize_local_database
        initialize_local_database(app.config['SQLITE_PATH'])
        app.logger.info('Local receiving database ready')
    elif app.config['DATABASE_BACKEND'] != 'mssql':
        raise ValueError('DATABASE_BACKEND must be sqlite or mssql.')

    if not app.config.get('SECRET_KEY'):
        app.config['SECRET_KEY'] = os.environ.get('RMA_SECRET_KEY')
        if not app.config['SECRET_KEY']:
            os.makedirs(app.config['MODI_RMA_DIR'], exist_ok=True)
            key_path = os.path.join(app.config['MODI_RMA_DIR'], '.session-key')
            try:
                with open(key_path, 'x', encoding='utf-8') as key_file:
                    key_file.write(secrets.token_hex(32))
            except FileExistsError:
                pass
            with open(key_path, encoding='utf-8') as key_file:
                app.config['SECRET_KEY'] = key_file.read().strip()

    # Register blueprints
    from app.routes.laptop import laptop_bp
    from app.routes.return_receiving_routes import return_receiving_bp
    from app.routes.return_units import return_units_bp
    from app.routes.receiving_admin import receiving_admin_bp
    from app.routes.non_laptop.non_laptop_routes import non_laptop_bp
    from app.routes.Auth import auth_bp
    from app.routes.images_rotes import images_bp
    from app.routes.report import report_bp
    from app.routes.xie.xie_routes import xie_bp

    app.register_blueprint(auth_bp, url_prefix='/auth')
    app.register_blueprint(laptop_bp, url_prefix='/laptop')
    app.register_blueprint(non_laptop_bp, url_prefix='/non_laptop')
    app.register_blueprint(return_receiving_bp, url_prefix='/return')
    app.register_blueprint(return_units_bp, url_prefix='/return')
    app.register_blueprint(receiving_admin_bp, url_prefix='/return')
    app.register_blueprint(images_bp, url_prefix='/images')
    app.register_blueprint(report_bp, url_prefix='/report')
    app.register_blueprint(xie_bp, url_prefix='/xie')
    from app.routes.department_admin import department_admin_bp
    from app.permissions import enforce_permissions
    app.register_blueprint(department_admin_bp, url_prefix='/return')
    app.before_request(enforce_permissions)

    app.logger.info('RMA Server startup')

    return app
