"""Bounded image uploads and storage paths shared by every receiving workflow."""
import io
import os
import re
import uuid
import warnings

from PIL import Image, ImageOps, UnidentifiedImageError


IMAGE_TYPES = frozenset(('laptop', 'non_laptop', 'return_receiving', 'return_units'))
IMAGE_FORMATS = {'JPEG': ('.jpg', 'image/jpeg'), 'PNG': ('.png', 'image/png'),
                 'GIF': ('.gif', 'image/gif'), 'WEBP': ('.webp', 'image/webp'),
                 'BMP': ('.bmp', 'image/bmp')}
IMAGE_EXTENSIONS = frozenset(('.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'))
MAX_IMAGE_BYTES = 4 * 1024 * 1024
MAX_IMAGE_PIXELS = 25_000_000


def storage_component(value):
    value = str(value) if value is not None else ''
    if (not value or len(value) > 255 or value in ('.', '..') or
            re.search(r'[\\/:*?"<>|\x00-\x1f]', value) or value[-1:] in ('.', ' ') or
            re.match(r'^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)', value, re.I)):
        raise ValueError('Use a valid record or tracking number without slashes or reserved characters.')
    return value


def image_directory(root, kind, item_id):
    if kind not in IMAGE_TYPES:
        raise ValueError('Unknown photo category.')
    root = os.path.realpath(root)
    base = os.path.realpath(os.path.join(root, 'images'))
    category = os.path.realpath(os.path.join(base, kind))
    target = os.path.realpath(os.path.join(category, storage_component(item_id)))
    if (os.path.commonpath([root, base]) != root or
            os.path.commonpath([base, category]) != base or
            os.path.commonpath([category, target]) != category or target == category):
        raise ValueError('Invalid photo location.')
    return target


def image_path(root, kind, item_id, filename):
    folder = image_directory(root, kind, item_id)
    filename = storage_component(filename)
    path = os.path.realpath(os.path.join(folder, filename))
    if os.path.commonpath([folder, path]) != folder or path == folder:
        raise ValueError('Invalid photo location.')
    return path


def validate_images(files, *, max_count=5, formats=('JPEG', 'PNG')):
    """Decode, bound, orient and re-encode images, discarding embedded metadata."""
    files = [file for file in files if file and file.filename]
    if len(files) > max_count:
        raise ValueError(f'Upload at most {max_count} photos at a time.')
    for file in files:
        if getattr(file, 'validated_image_bytes', None) is not None:
            continue
        file.stream.seek(0)
        data = file.stream.read(MAX_IMAGE_BYTES + 1)
        file.stream.seek(0)
        if len(data) > MAX_IMAGE_BYTES:
            raise ValueError('Each photo must be at most 4 MB.')
        try:
            with warnings.catch_warnings():
                warnings.simplefilter('error', Image.DecompressionBombWarning)
                with Image.open(io.BytesIO(data)) as original:
                    if original.format not in formats:
                        raise ValueError('Upload JPEG or PNG photos only.')
                    if original.width * original.height > MAX_IMAGE_PIXELS:
                        raise ValueError('Each photo must be at most 25 megapixels.')
                    file.receiving_extension = IMAGE_FORMATS[original.format][0]
                    output_format = original.format
                    original.load()
                    normalized = ImageOps.exif_transpose(original)
                    # A fresh image excludes GPS, EXIF, comments and appended payloads.
                    mode = 'RGB' if output_format == 'JPEG' else ('RGBA' if 'A' in normalized.getbands() or 'transparency' in normalized.info else 'RGB')
                    clean = Image.new(mode, normalized.size)
                    clean.paste(normalized.convert(mode))
                    output = io.BytesIO()
                    clean.save(output, format=output_format)
                    file.validated_image_bytes = output.getvalue()
                    if len(file.validated_image_bytes) > MAX_IMAGE_BYTES:
                        raise ValueError('This photo is too large after processing. Choose a smaller photo.')
        except (UnidentifiedImageError, OSError, SyntaxError, Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
            raise ValueError('This photo cannot be read. Choose a valid JPEG or PNG photo.') from exc
    return files


def save_image_files(root, kind, item_id, files):
    files = validate_images(files)
    folder = image_directory(root, kind, item_id)
    if not files:
        return []
    os.makedirs(folder, exist_ok=True)
    created = []
    try:
        for file in files:
            name = uuid.uuid4().hex + file.receiving_extension
            path = image_path(root, kind, item_id, name)
            with open(path, 'xb') as target:
                created.append(path)
                target.write(file.validated_image_bytes)
        return [os.path.basename(path) for path in created]
    except Exception:
        for path in created:
            if os.path.isfile(path):
                os.remove(path)
        raise


def list_image_files(root, kind, item_id):
    folder = image_directory(root, kind, item_id)
    if not os.path.isdir(folder):
        return []
    result = []
    for name in sorted(os.listdir(folder)):
        if os.path.splitext(name)[1].lower() not in IMAGE_EXTENSIONS:
            continue
        try:
            path = image_path(root, kind, item_id, name)
        except ValueError:
            continue
        if os.path.isfile(path):
            try:
                with Image.open(path) as photo:
                    if photo.format in IMAGE_FORMATS:
                        result.append(name)
            except (OSError, ValueError, Image.DecompressionBombError):
                # Ignore old non-photo files instead of showing broken thumbnails.
                continue
    return result
