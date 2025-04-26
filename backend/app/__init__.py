# app/__init__.py
from flask import Flask
import pyodbc
from config import Config
from flask_cors import CORS

def create_app():
    app = Flask(__name__)
    CORS(app)

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
    
    return app