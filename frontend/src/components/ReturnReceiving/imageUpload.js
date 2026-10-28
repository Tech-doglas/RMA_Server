const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const TARGET_UPLOAD_BYTES = 1024 * 1024;
const MAX_IMAGE_DIMENSION = 1600;

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const previewUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(previewUrl);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(previewUrl);
      reject(new Error(`Unable to read image: ${file.name}`));
    };

    image.src = previewUrl;
  });
}

function canvasToBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }

      reject(new Error('Unable to optimize image for upload.'));
    }, 'image/jpeg', quality);
  });
}

export async function optimizeImageForUpload(file, index) {
  if (!file || file.size <= TARGET_UPLOAD_BYTES) {
    return file;
  }

  const image = await loadImage(file);
  const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(image.width, image.height));
  const canvas = document.createElement('canvas');

  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Unable to prepare image upload.');
  }
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  let quality = 0.82;
  let blob = await canvasToBlob(canvas, quality);

  while (blob.size > TARGET_UPLOAD_BYTES && quality > 0.5) {
    quality -= 0.08;
    blob = await canvasToBlob(canvas, quality);
  }

  if (blob.size >= file.size && file.size <= MAX_IMAGE_BYTES) {
    return file;
  }

  const baseName = (file.name || `shipping-label-${index + 1}`).replace(/\.[^.]+$/, '');
  return new File([blob], `${baseName}.jpg`, {
    type: 'image/jpeg',
    lastModified: Date.now(),
  });
}
