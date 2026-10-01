# app/models.py
import pyodbc
import os
from contextlib import contextmanager
from flask import current_app
from werkzeug.exceptions import ServiceUnavailable

def get_project_root():
    if current_app:
        return os.path.dirname(current_app.root_path)
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def get_modi_rma_root():
    try:
        path = current_app.config['MODI_RMA_DIR']
        if not os.path.exists(path):
            os.makedirs(path)
        return path
    except:
        return get_project_root()

def get_db_connection():
    if current_app.config.get('DATABASE_BACKEND') == 'sqlite':
        from app.local_database import LocalConnection
        return LocalConnection(current_app.config['SQLITE_PATH'])
    driver = current_app.config['SQL_DRIVER'].strip('{}')
    if driver not in pyodbc.drivers():
        raise ServiceUnavailable(description=f'Database connection unavailable: install {driver} on this PC.')
    try:
        return pyodbc.connect(current_app.config['CONN_STR'], timeout=5)
    except pyodbc.Error as exc:
        current_app.logger.error('Database connection failed (ODBC state %s)', exc.args[0] if exc.args else 'unknown')
        raise ServiceUnavailable(description='Database connection unavailable. Check the SQL Server address, network access, and database credentials.') from exc

@contextmanager
def db_connection():
    conn = get_db_connection()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

def save_laptop_images(images, type, item_id):
    from app.uploads import image_directory, save_image_files
    root = get_modi_rma_root()
    save_image_files(root, type, item_id, images)
    return image_directory(root, type, item_id)


def get_laptop_image_files(type, item_id):
    from app.uploads import list_image_files
    return list_image_files(get_modi_rma_root(), type, item_id)


def save_shipping_label_image(images, tracking_number):
    return save_laptop_images(images, 'return_receiving', tracking_number)


def get_shipping_label_image(tracking_number):
    return get_laptop_image_files('return_receiving', tracking_number)