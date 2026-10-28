import os

from flask import Blueprint, current_app, jsonify, send_file
from PIL import Image, UnidentifiedImageError
from app.models import get_modi_rma_root
from app.uploads import IMAGE_FORMATS, image_path, list_image_files

images_bp = Blueprint('images', __name__)


@images_bp.route('/delete_image/<type>/<id>/<filename>', methods=['POST'])
def delete_image(type, id, filename):
    try:
        # Unit photo URLs are stored in the receiving records. Direct filesystem
        # deletion would leave broken references, including shared delivery photos.
        if type == 'return_units':
            return jsonify(error='Unit photos are kept with their receiving record.'), 400
        path = image_path(get_modi_rma_root(), type, id, filename)
        if not os.path.isfile(path):
            return jsonify(error='Photo not found.'), 404
        os.remove(path)
        return jsonify(message='Photo deleted.'), 200
    except ValueError as exc:
        return jsonify(error=str(exc)), 400
    except OSError:
        current_app.logger.exception('Photo deletion failed')
        return jsonify(error='Unable to delete this photo. Please try again.'), 500


@images_bp.route('/<type>/<id>/<filename>')
def preview_image(type, id, filename):
    try:
        path = image_path(get_modi_rma_root(), type, id, filename)
        if not os.path.isfile(path):
            return jsonify(error='Photo not found.'), 404
        # Use the actual image format, never a user-supplied filename/MIME type.
        with Image.open(path) as photo:
            image_format = IMAGE_FORMATS.get(photo.format)
        if not image_format:
            return jsonify(error='Photo format is not supported.'), 404
        response = send_file(path, mimetype=image_format[1], conditional=True)
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['Content-Security-Policy'] = "default-src 'none'; sandbox"
        response.headers['Cache-Control'] = 'private, no-store'
        return response
    except (ValueError, UnidentifiedImageError, Image.DecompressionBombError):
        return jsonify(error='Photo not found.'), 404
    except OSError:
        current_app.logger.exception('Photo read failed')
        return jsonify(error='Unable to open this photo. Please try again.'), 500


@images_bp.route('/api/<type>/<id>')
def list_images(type, id):
    try:
        return jsonify(list_image_files(get_modi_rma_root(), type, id))
    except ValueError as exc:
        return jsonify(error=str(exc)), 400
    except OSError:
        current_app.logger.exception('Photo list failed')
        return jsonify(error='Unable to load photos. Please try again.'), 500