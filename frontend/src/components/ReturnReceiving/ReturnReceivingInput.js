import React, {useState} from 'react';
import GenericForm from '../common/GenericForm';
import Toast from '../common/Toast';

const apiHost = window.location.hostname;
const apiBaseUrl = `${apiHost}:8088`;

function ReturnReceivingInput() {
    const [toast, setToast] = useState(null);

  const initialData = {
    trackingNumber: '',
    company: '',
    remark: '',
    image: [],
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
      name: 'remark',
      label: 'Remark',
      type: 'textarea',
      rows: 5,
    },
    {
      name: 'image',
      label: 'Upload Shipping Label Image (max 4MB each)',
      type: 'file',
      multiple: false,
      accept: 'image/jpg,image/jpeg,image/png',
      required: true,
    },
  ];

  const handleSubmit = async (formData) => {
    const data = new FormData();
    data.append('tracking_number', formData.trackingNumber);
    data.append('company', formData.company);
    data.append('remark', formData.remark);
    if (formData.image && formData.image.length > 0) {
      const images = Array.from(formData.image);
      images.forEach((file) => {
        data.append('image', file);
      });
    }
  
    try {
      const res = await fetch(`http://${apiBaseUrl}/return/submit`, {
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