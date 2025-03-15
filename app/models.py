# app/models.py
import pyodbc
import os
from flask import current_app

def get_project_root():
    if current_app:
        return os.path.dirname(current_app.root_path)
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def get_db_connection():
    return pyodbc.connect(current_app.config['CONN_STR'])

def save_images(images, item_id):
    image_dir = os.path.join('images', str(item_id))
    os.makedirs(image_dir, exist_ok=True)
    
    from werkzeug.utils import secure_filename
    for i, image in enumerate(images, start=1):
        if image and image.filename:
            ext = os.path.splitext(secure_filename(image.filename))[1]
            filename = f"{i}{ext}"
            image_path = os.path.join(image_dir, filename)
            image.save(image_path)
    return image_dir

def get_image_files(item_id):
    image_dir = os.path.join(get_project_root(), 'images', str(item_id))
    if os.path.exists(image_dir):
        files = sorted([f for f in os.listdir(image_dir) if os.path.isfile(os.path.join(image_dir, f))])
        return files
    return []