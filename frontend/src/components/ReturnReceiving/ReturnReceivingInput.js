import React, { useState } from 'react';
import GenericForm from '../common/GenericForm';
import Toast from '../common/Toast';

const MAX_IMAGE_COUNT = 5;
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

async function optimizeImageForUpload(file, index) {
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

function ReturnReceivingInput() {
  const [toast, setToast] = useState(null);

  const initialData = {
    trackingNumber: '',
    code: '',
    company: '',
    remark: '',
    image: Array.from({ length: 5 }, () => undefined),
  };

  const fields = [
    {
      name: 'trackingNumber',
      label: 'Tracking #',
      type: 'text',
      placeholder: 'e.g., 1ZV390E3000000000',
      required: true,
    },
    {
      name: 'company',
      label: 'Company',
      type: 'select',
      options: [
        { value: '', label: 'Select company', disabled: true },
        { value: 'PX/LEO/KRIZY', label: 'PX/LEO/KRIZY' },
        { value: 'SNOWBELL/XIE/PITY TECH', label: 'SNOWBELL/XIE/PITY TECH' },
        { value: 'Others', label: 'Others' },
      ],
      required: true,
    },
    {
      name: 'code',
      label: 'Code',
      type: 'select',
      options: [
        { value: '', label: 'Select code', disabled: true },
        { value: '0000', label: '0000' },
        { value: 'QUICK_CHECK', label: 'QUICK_CHECK' },
        { value: 'DETAIL_CHECK', label: 'DETAIL_CHECK' },
        { value: 'REGULAR', label: 'REGULAR' },
        { value: 'BULK_NEW', label: 'BULK_NEW' },
      ],
      required: true,
    },
    {
      name: 'remark',
      label: 'Remark',
      type: 'textarea',
      rows: 5,
    },
    {
      name: 'image',
      label: 'Upload Shipping Label Image (up to 5, optimized before upload)',
      type: 'file',
      accept: 'image/jpg,image/jpeg,image/png',
      capture: 'environment',
      multiple: true,
      required: true,
      validate: (value) => {
        const images = Array.from(value || []).filter(Boolean);
        if (images.length === 0) {
          return 'Please upload at least one shipping label image';
        }
        if (images.length > MAX_IMAGE_COUNT) {
          return `Please upload no more than ${MAX_IMAGE_COUNT} images`;
        }
        return null;
      },
    },
  ];

  const handleSubmit = async (formData) => {
    try {
      const data = new FormData();
      data.append('tracking_number', formData.trackingNumber);
      data.append('company', formData.company);
      data.append('code', formData.code);
      data.append('remark', formData.remark);

      if (formData.image && formData.image.length > 0) {
        const selectedImages = Array.from(formData.image).filter(Boolean);
        const optimizedImages = await Promise.all(
          selectedImages.map((file, index) => optimizeImageForUpload(file, index))
        );

        const oversizedImage = optimizedImages.find((file) => file.size > MAX_IMAGE_BYTES);
        if (oversizedImage) {
          setToast({
            message: `"${oversizedImage.name}" is still over 4MB after optimization. Please retake it closer to the label.`,
            type: 'error',
          });
          return { success: false };
        }

        optimizedImages.forEach((file) => {
          data.append('images', file);
        });
      }

      const res = await fetch(`http://${window.location.hostname}:8088/return/submit`, {
        method: 'POST',
        body: data,
      });

      if (res.ok) {
        setToast({ message: '✔️ Submitted successfully', type: 'success' });
        return { success: true };
      } else {
        const errorText = await res.text();
        setToast({ message: errorText || 'Failed to Submit', type: 'error' });
        return { success: false };
      }
    } catch (err) {
      setToast({ message: err.message || 'Submit error. Try again later.', type: 'error' });
      return { success: false };
    }
  };



  return (
    <>
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
      <GenericForm
        initialData={initialData}
        fields={fields}
        onSubmit={handleSubmit}
        basePath="/return"
      />
    </>
  );
}

export default ReturnReceivingInput;
