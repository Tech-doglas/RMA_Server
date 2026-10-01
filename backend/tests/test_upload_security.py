"""Photo security checks use isolated storage and never touch live records."""
import io
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from flask import Flask
from PIL import Image
from werkzeug.datastructures import FileStorage

sys.path.insert(0, str(Path(__file__).parents[1]))
from app.uploads import (MAX_IMAGE_BYTES, image_directory, image_path,
                         save_image_files, validate_images)
from app.routes.images_rotes import images_bp


class UploadSecurityTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory(dir=Path(__file__).parent)
        self.addCleanup(self.folder.cleanup)
        self.root = Path(self.folder.name)
        self.app = Flask(__name__)
        self.app.config['MODI_RMA_DIR'] = self.folder.name
        self.app.register_blueprint(images_bp, url_prefix='/images')
        self.client = self.app.test_client()

    def photo(self, name='photo.png'):
        source = io.BytesIO()
        Image.new('RGB', (2, 2), 'red').save(source, format='PNG')
        source.seek(0)
        return FileStorage(source, filename=name, content_type='image/png')

    def test_paths_reject_windows_and_url_traversal(self):
        for value in ('..', '..\\outside', 'C:\\secret', 'file:stream', 'NUL', 'COM1.txt', '', 'trail.'):
            with self.subTest(value=value), self.assertRaises(ValueError):
                image_directory(self.folder.name, 'non_laptop', value)
        with self.assertRaises(ValueError):
            image_directory(self.folder.name, '..', 'file')
        with self.assertRaises(ValueError):
            image_path(self.folder.name, 'laptop', '123', '..\\secret.png')
        self.assertEqual(self.client.get('/images/api/laptop/..%5Coutside').status_code, 400)
        self.assertEqual(self.client.post('/images/delete_image/laptop/..%5Coutside/secret.png').status_code, 400)

    def test_broken_spoofed_oversize_and_excess_files_are_rejected(self):
        for content in (b'<svg onload="alert(1)"/>', b'\x89PNG\r\n\x1a\nfake', b'\xff\xd8\xfffake'):
            with self.assertRaises(ValueError):
                validate_images([FileStorage(io.BytesIO(content), filename='photo.png')])
        with self.assertRaises(ValueError):
            validate_images([FileStorage(io.BytesIO(b'x' * (MAX_IMAGE_BYTES + 1)), filename='large.jpg')])
        with self.assertRaises(ValueError):
            validate_images([self.photo() for _ in range(6)])
        with patch('app.uploads.MAX_IMAGE_PIXELS', 3), self.assertRaises(ValueError):
            validate_images([self.photo()])

    def test_new_uploads_preserve_old_files_and_remove_appended_payload(self):
        folder = Path(image_directory(self.folder.name, 'non_laptop', 'TRACK-1'))
        folder.mkdir(parents=True)
        old = folder / '3.png'
        old.write_bytes(self.photo().read())
        original = old.read_bytes()
        first = self.photo('../../evil.html')
        first.stream.seek(0, 2)
        first.stream.write(b'<script>unwanted()</script>')
        first.stream.seek(0)
        names = save_image_files(self.folder.name, 'non_laptop', 'TRACK-1', [first, self.photo()])
        self.assertEqual(len(set(names)), 2)
        self.assertEqual(old.read_bytes(), original)
        for name in names:
            self.assertTrue(name.endswith('.png'))
            self.assertNotIn(b'<script>', (folder / name).read_bytes())
            with Image.open(folder / name) as saved:
                self.assertEqual(saved.size, (2, 2))

    def test_serving_uses_real_image_type_and_keeps_legacy_photos(self):
        folder = Path(image_directory(self.folder.name, 'laptop', '123'))
        folder.mkdir(parents=True)
        (folder / '1.png').write_bytes(self.photo().read())
        (folder / 'malicious.html').write_text('<script>bad()</script>')
        (folder / 'fake.png').write_text('<script>bad()</script>')
        (folder / 'nested.png').mkdir()
        listing = self.client.get('/images/api/laptop/123')
        self.assertEqual(listing.json, ['1.png'])
        response = self.client.get('/images/laptop/123/1.png')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.mimetype, 'image/png')
        self.assertEqual(response.headers['X-Content-Type-Options'], 'nosniff')
        self.assertIn('no-store', response.headers['Cache-Control'])
        response.close()
        for name in ('malicious.html', 'fake.png', 'missing.png'):
            self.assertEqual(self.client.get('/images/laptop/123/' + name).status_code, 404)

    def test_unit_files_cannot_be_removed_without_record_metadata_update(self):
        name = save_image_files(self.folder.name, 'return_units', 'g_test', [self.photo()])[0]
        response = self.client.post('/images/delete_image/return_units/g_test/' + name)
        self.assertEqual(response.status_code, 400)
        self.assertTrue((self.root / 'images' / 'return_units' / 'g_test' / name).is_file())

    def test_failed_photo_save_cleans_only_new_files(self):
        folder = Path(image_directory(self.folder.name, 'laptop', '123'))
        folder.mkdir(parents=True)
        original = folder / '1.png'
        original.write_bytes(self.photo().read())
        real_open = open
        writes = 0

        def fail_second_write(path, mode='r', *args, **kwargs):
            nonlocal writes
            if mode == 'xb':
                writes += 1
                if writes == 2:
                    raise OSError('Simulated full disk')
            return real_open(path, mode, *args, **kwargs)

        with patch('builtins.open', side_effect=fail_second_write), self.assertRaises(OSError):
            save_image_files(self.folder.name, 'laptop', '123', [self.photo(), self.photo()])
        self.assertEqual([path.name for path in folder.iterdir()], ['1.png'])


if __name__ == '__main__':
    unittest.main()
