# app/__init__.py
from flask import Flask
import pyodbc
from config import Config

def create_app():
    app = Flask(__name__)

    # Database connection string
    app.config['CONN_STR'] = (
        f"DRIVER={Config.DRIVER};"
        f"SERVER={Config.SQL_SERVER};"
        f"DATABASE={Config.DATABASE};"
        f"UID={Config.UID};"
        f"PWD={Config.PWD};"
        f"TrustServerCertificate={Config.TRUST_CERT};"
    )

    # Register blueprints
    from app.routes.main_routes import main_bp
    from app.routes.item_routes import item_bp
    from app.routes.sales_routes import sales_bp
    
    app.register_blueprint(main_bp)
    app.register_blueprint(item_bp, url_prefix='/item')
    app.register_blueprint(sales_bp, url_prefix='/sales')

    return app