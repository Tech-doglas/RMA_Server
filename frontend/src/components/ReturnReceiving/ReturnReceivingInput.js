import React, { useState } from 'react';
import GenericForm from '../common/GenericForm';
import Toast from '../common/Toast';

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
      label: 'Upload Shipping Label Image (max 4MB each)',
      type: 'file',
      accept: 'image/jpg,image/jpeg,image/png',
      capture: 'environment',
      multiple: true,
      required: true,
      validate: (value) => {
        if (!value || value.filter(v => v).length === 0) {
          return 'Please upload at least one shipping label image';
        }
        return null;
      },
    },
  ];

  const handleSubmit = async (formData) => {
    const data = new FormData();
    data.append('tracking_number', formData.trackingNumber);
    data.append('company', formData.company);
    data.append('code', formData.code);
    data.append('remark', formData.remark);
    if (formData.image && formData.image.length > 0) {
      const images = Array.from(formData.image);
      images.forEach((file) => {
        data.append('images', file);
      });
    }

    try {
      const res = await fetch(`http://${window.location.hostname}:8088/return/submit`, {
        method: 'POST',
        body: data,
      });

      if (res.ok) {
        setToast({ message: '✔️ Submitted successfully', type: 'success' });
      } else {
        const errorText = await res.text();
        setToast({ message: errorText || 'Failed to Submit', type: 'error' });
      }
    } catch (err) {
      setToast({ message: 'Submit error. Try again later.', type: 'error' })
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
