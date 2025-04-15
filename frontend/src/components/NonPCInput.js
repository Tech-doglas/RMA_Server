import React from 'react';
import GenericForm from './common/GenericForm';

function NonPCInput() {
  const initialData = {
    trackingNumber: '',
    receivedDate: '',
    category: '',
    name: '',
    odooRef: '',
    condition: '',
    qty: '',
    location: '',
    remark: '',
    images: [],
    user: '',
  };

  const fields = [
    {
      name: 'trackingNumber',
      label: 'Tracking #',
      type: 'text',
      placeholder: 'e.g., RA428003440US',
      required: true,
    },
    {
      name: 'receivedDate',
      label: 'Received Date',
      type: 'date',
      required: true,
    },
    {
      name: 'category',
      label: 'Category',
      type: 'select',
      options: [
        { value: '', label: 'Select a Category', disabled: true },
        { value: 'Electronic', label: 'Electronic Devices' },
        { value: 'Printer', label: 'Printer' },
        { value: 'Monitor', label: 'Monitor' },
        { value: 'Other', label: 'Other' },
      ],
      required: true,
    },
    {
      name: 'name',
      label: 'Name',
      type: 'text',
      placeholder: 'e.g., Google Nest Hub',
      required: true,
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
      name: 'qty',
      label: 'Qty',
      type: 'number',
      placeholder: 'e.g., 2',
      required: true,
    },
    {
      name: 'location',
      label: 'Location',
      type: 'text',
      placeholder: 'e.g., On Pallet/A1',
      required: true,
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
      required: true,
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
    console.log('New Non-Laptop:', data);
  };

  return (
    <GenericForm
      initialData={initialData}
      fields={fields}
      onSubmit={handleSubmit}
      basePath="/non-pc"
    />
  );
}

export default NonPCInput;