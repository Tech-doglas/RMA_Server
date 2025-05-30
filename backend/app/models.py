# app/models.py
import pyodbc
import os
from flask import current_app

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
    return pyodbc.connect(current_app.config['CONN_STR'])

def save_laptop_images(images, type, item_id):
    image_dir = os.path.join(get_modi_rma_root(), 'images', type, str(item_id))
    os.makedirs(image_dir, exist_ok=True)
    
    from werkzeug.utils import secure_filename
    for i, image in enumerate(images, start=1):
        if image and image.filename:
            ext = os.path.splitext(secure_filename(image.filename))[1]
            filename = f"{i}{ext}"
            image_path = os.path.join(image_dir, filename)
            image.save(image_path)
    return image_dir

def get_laptop_image_files(type, item_id):
    image_dir = os.path.join(get_modi_rma_root(), 'images', type, str(item_id))
    if os.path.exists(image_dir):
        files = sorted([f for f in os.listdir(image_dir) if os.path.isfile(os.path.join(image_dir, f))])
        return files
    return []

def save_shipping_label_image(images, tracking_number):
    image_dir = os.path.join(get_modi_rma_root(), 'images', 'return_receiving', tracking_number)
    os.makedirs(image_dir, exist_ok=True)
    
    from werkzeug.utils import secure_filename

    for i, image in enumerate(images, start=1):
        if image and image.filename:
            ext = os.path.splitext(secure_filename(image.filename))[1]
            filename = f"{i}{ext}"
            image_path = os.path.join(image_dir, filename)
            image.save(image_path)
    return image_dir

    # if image and image.filename:
    #     filename = secure_filename(image.filename)
    #     ext = os.path.splitext(filename)[1]
    #     saved_filename = f"{tracking_number}{ext}"
    #     image_dir = os.path.join(get_modi_rma_root(), 'images', 'return_receiving')
    #     try:
    #         os.makedirs(image_dir, exist_ok=True)
    #         image_path = os.path.join(image_dir, saved_filename)
    #         image.save(image_path)
    #         print(f"✅ Image saved to: {image_path}")
    #     except Exception as e:
    #         print(f"❌ Failed to save image: {e}")
    # else:
    #     print("⚠️ Image missing or empty filename")
    # return image_dir

def get_shipping_label_image(tracking_number):
    image_dir = os.path.join(get_modi_rma_root(), 'images', 'return_receiving', tracking_number)
    if os.path.exists(image_dir):
        files = sorted([f for f in os.listdir(image_dir) if os.path.isfile(os.path.join(image_dir, f))])
        return files
    return []
    # image_dir = os.path.join(get_modi_rma_root(), 'images', 'return_receiving')
    # if os.path.exists(image_dir):
    #     for filename in os.listdir(image_dir):
    #         if filename.startswith(tracking_number):
    #             return filename
    # return None