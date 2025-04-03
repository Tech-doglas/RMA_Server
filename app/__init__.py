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

    app.config['MODI_RMA_DIR'] = Config.MODI_RMA_DIR

    # Register blueprints
    from app.routes.index_routes import index_bp
    from app.routes.laptop.laptop_routes import laptop_bp
    from app.routes.return_receiving_routes import return_receiving_bp
    from app.routes.user_routes import user_bp
    from app.routes.non_laptop.non_laptop_routes import non_laptop_bp
    
    app.register_blueprint(index_bp)
    app.register_blueprint(laptop_bp, url_prefix='/laptop')
    app.register_blueprint(non_laptop_bp, url_prefix='/non_laptop')
    app.register_blueprint(return_receiving_bp, url_prefix='/return_receiving')
    app.register_blueprint(user_bp, url_prefix='/user')
    return app