# app/__init__.py
import logging
from logging.handlers import RotatingFileHandler
import os
import time

from flask import Flask, request, g
import pyodbc
from config import Config
from flask_cors import CORS


def create_app():
    app = Flask(__name__)
    CORS(app)

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
    log_dir = '/logs'
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
        # Capture request body before route consumes the stream
        try:
            if request.content_type and 'multipart' in request.content_type:
                # Do not touch request.form here; parsing multipart bodies can block on
                # the full upload and hides whether time is spent on the network or in
                # the route handler.
                g.request_body = f'<multipart content_length={request.content_length}>'
            elif request.is_json:
                g.request_body = str(request.get_json(silent=True) or {})
            else:
                g.request_body = request.get_data(as_text=True)[:500]
        except Exception:
            g.request_body = '<unreadable>'

    @app.after_request
    def log_request_end(response):
        duration = (time.time() - getattr(g, 'start_time', time.time())) * 1000
        body = getattr(g, 'request_body', '')
        if body and len(body) > 500:
            body = body[:500] + '...[truncated]'

        msg = '%s %s %s %.0fms | IP: %s | UA: %s | Body: %s'
        args = (
            request.method, request.path, response.status_code,
            duration, request.remote_addr,
            request.user_agent.string, body
        )

        if response.status_code >= 500:
            app.logger.error(msg, *args)
        else:
            app.logger.info(msg, *args)

        return response

    # Database connection string
    app.config['CONN_STR'] = (
        f"DRIVER={Config.DRIVER};"
        f"SERVER={Config.SQL_SERVER};"
        f"DATABASE={Config.DATABASE};"
        f"UID={Config.UID};"
        f"PWD={Config.PWD};"
        f"TrustServerCertificate={Config.TRUST_CERT};"
    )

    app.config['MODI_RMA_DIR'] = Config.MODI_RMA_DIR

    # Register blueprints
    from app.routes.laptop import laptop_bp
    from app.routes.return_receiving_routes import return_receiving_bp
    from app.routes.non_laptop.non_laptop_routes import non_laptop_bp
    from app.routes.Auth import auth_bp
    from app.routes.images_rotes import images_bp
    from app.routes.report import report_bp
    from app.routes.xie.xie_routes import xie_bp

    app.register_blueprint(auth_bp, url_prefix='/auth')
    app.register_blueprint(laptop_bp, url_prefix='/laptop')
    app.register_blueprint(non_laptop_bp, url_prefix='/non_laptop')
    app.register_blueprint(return_receiving_bp, url_prefix='/return')
    app.register_blueprint(images_bp, url_prefix='/images')
    app.register_blueprint(report_bp, url_prefix='/report')
    app.register_blueprint(xie_bp, url_prefix='/xie')

    app.logger.info('RMA Server startup')

    return app
