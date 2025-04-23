from flask import Blueprint, send_from_directory, jsonify
from app.models import get_modi_rma_root, get_shipping_label_image
import os

images_bp = Blueprint('images', __name__)

@images_bp.route('/delete_image/<type>/<id>/<filename>', methods=['POST'])
def delete_image(type, id, filename):
    try:
        image_dir = os.path.join(get_modi_rma_root(), 'images', type, str(id))
        image_path = os.path.join(image_dir, filename)
        if os.path.exists(image_path):
            os.remove(image_path)
            return "Image deleted successfully", 200
        return "Image not found", 404
    except Exception as e:
        return f"Error deleting image: {str(e)}", 500
    
@images_bp.route('/<type>/<id>/<filename>')
def preview_image(type, id, filename):
    try:
        if type in ['laptop', 'non_laptop']:
            image_dir = os.path.join(get_modi_rma_root(), 'images', type, str(id))
        else:
            image_dir = os.path.join(get_modi_rma_root(), 'images', 'return_receiving')
        if not os.path.exists(image_dir):
            return "Image directory not found", 404
        return send_from_directory(image_dir, filename)
    except Exception as e:
        return f"Error: {str(e)}", 500
    
@images_bp.route('/api/<type>/<id>')
def list_images(type, id):
    try:
        if type == 'return_receiving':
            filename = get_shipping_label_image(id)
            if filename:
                return jsonify([filename])
            else:
                return jsonify([])
        else:
            image_dir = os.path.join(get_modi_rma_root(), 'images', type, str(id))
            if not os.path.isdir(image_dir):
                return jsonify([])
            filenames = os.listdir(image_dir)
            return jsonify(filenames)
    except Exception as e:
        return jsonify({'error': str(e)}), 500
