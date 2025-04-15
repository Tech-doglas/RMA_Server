import React from 'react';
import GenericForm from './common/GenericForm';

function LaptopInput() {
  const initialData = {
    brand: '',
    model: '',
    ram: '',
    ssd: '',
    serialNumber: '',
    odooRef: '',
    condition: '',
    sealed: false,
    odooRecord: false,
    remark: '',
    images: [],
    user: '',
  };

  const fields = [
    {
      name: 'brand',
      label: 'Brand',
      type: 'select',
      options: [
        { value: '', label: 'Select a brand', disabled: true },
        { value: 'HP', label: 'HP' },
        { value: 'Dell', label: 'Dell' },
        { value: 'Lenovo', label: 'Lenovo' },
        { value: 'Apple', label: 'Apple' },
        { value: 'Acer', label: 'Acer' },
        { value: 'ASUS', label: 'ASUS' },
        { value: 'MSI', label: 'MSI' },
        { value: 'IBuyPower', label: 'IBuyPower' },
      ],
      required: true,
    },
    {
      name: 'model',
      label: 'Model',
      type: 'text',
      placeholder: 'e.g., XPS-13',
      required: true,
    },
    {
      name: 'ram',
      label: 'RAM',
      type: 'select',
      options: [
        { value: '', label: 'Select RAM', disabled: true },
        { value: '4GB', label: '4GB' },
        { value: '8GB', label: '8GB' },
        { value: '12GB', label: '12GB' },
        { value: '16GB', label: '16GB' },
        { value: '24GB', label: '24GB' },
        { value: '32GB', label: '32GB' },
        { value: '40GB', label: '40GB' },
        { value: '48GB', label: '48GB' },
        { value: '64GB', label: '64GB' },
      ],
      required: true,
    },
    {
      name: 'ssd',
      label: 'Storage',
      type: 'select',
      options: [
        { value: '', label: 'Select storage', disabled: true },
        { value: '64GB', label: '64GB EMMC SSD' },
        { value: '128GBe', label: '128GB EMMC SSD' },
        { value: '128GB', label: '128GB SSD' },
        { value: '256GB', label: '256GB SSD' },
        { value: '512GB', label: '512GB SSD' },
        { value: '1TB', label: '1TB SSD' },
        { value: '2TB', label: '2TB SSD' },
        { value: '4TB', label: '4TB SSD' },
      ],
      required: true,
    },
    {
      name: 'serialNumber',
      label: 'Serial Number',
      type: 'text',
      placeholder: 'e.g., A123456',
      required: true,
      validate: (value) => value.length < 5 ? 'Serial number must be at least 5 characters long' : null,
    },
    {
      name: 'odooRef',
      label: 'Odoo Code',
      type: 'text',
      placeholder: 'e.g., HP100022RA',
      required: true,
    },
    {
      name: 'condition',
      label: 'Condition',
      type: 'select',
      options: [
        { value: '', label: 'Select condition', disabled: true },
        { value: 'N', label: 'Back to New' },
        { value: 'A', label: 'Grade A' },
        { value: 'B', label: 'Grade B' },
        { value: 'C', label: 'Grade C' },
        { value: 'F', label: 'Grade F' },
      ],
      required: true,
    },
    {
      name: 'sealed',
      label: 'Sealed',
      type: 'checkbox',
    },
    {
      name: 'odooRecord',
      label: 'Odoo Record',
      type: 'checkbox',
    },
    {
      name: 'remark',
      label: 'Remark',
      type: 'textarea',
      placeholder: 'e.g., No power, No display, etc.',
    },
    {
      name: 'images',
      label: 'Upload Images (max 4MB each)',
      type: 'file',
      multiple: true,
      accept: 'image/jpg,image/jpeg,image/png',
      validate: (value, formData) => ['B', 'C', 'F'].includes(formData.condition) && value.length === 0 ? 'Grades B, C, and F require at least one photo' : null,
    },
    {
      name: 'user',
      label: 'User',
      type: 'select',
      options: [
        { value: '', label: 'Select User', disabled: true },
        { value: 'admin', label: 'admin' },
        { value: 'user1', label: 'user1' },
        { value: 'user2', label: 'user2' },
      ],
      required: true,
    },
  ];

  const handleSubmit = (data) => {
    console.log('New Laptop:', data);
  };

  return (
    <GenericForm
      initialData={initialData}
      fields={fields}
      onSubmit={handleSubmit}
      basePath="/pc"
    />
  );
}

export default LaptopInput;