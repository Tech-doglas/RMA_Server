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
    from app.routes.index_routes import index_bp
    from app.routes.laptop_routes import laptop_bp
    
    app.register_blueprint(index_bp)
    app.register_blueprint(laptop_bp, url_prefix='/laptop')

    return app