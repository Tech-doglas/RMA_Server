import React from 'react';
import GenericForm from './common/GenericForm';

function ReturnReceivingInput() {
  const initialData = {
    trackingNumber: '',
    company: '',
    remark: '',
    image: null,
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

  const handleSubmit = (data) => {
    console.log('New Return Receiving Record:', data);
  };

  return (
    <GenericForm
      initialData={initialData}
      fields={fields}
      onSubmit={handleSubmit}
      basePath="/return-receiving"
    />
  );
}

export default ReturnReceivingInput;