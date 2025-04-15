import React from 'react';
import { useParams } from 'react-router-dom';
import GenericForm from './common/GenericForm';
import nonLaptops from '../data/nonLaptops';

function NonPCEdit() {
  const { id } = useParams();
  const nonLaptop = nonLaptops.find((nl) => nl.ID === parseInt(id));

  const initialData = {
    trackingNumber: nonLaptop?.TrackingNumber || '',
    receivedDate: nonLaptop?.ReceivedDate || '',
    category: nonLaptop?.Category || '',
    name: nonLaptop?.Name || '',
    odooRef: nonLaptop?.OdooRef || '',
    condition: nonLaptop?.Condition || '',
    location: nonLaptop?.Location || '',
    remark: nonLaptop?.Remark || '',
    newImages: [],
    user: nonLaptop?.LastModifiedUser || '',
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
        { value: 'N', label: 'Back to New' },
        { value: 'A', label: 'Grade A' },
        { value: 'B', label: 'Grade B' },
        { value: 'C', label: 'Grade C' },
        { value: 'F', label: 'Grade F' },
      ],
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
    },
    {
      name: 'newImages',
      label: 'Add New Images',
      type: 'file',
      multiple: true,
      accept: 'image/*',
      validate: (value, formData) => ['B', 'C', 'F'].includes(formData.condition) && value.length === 0 && nonLaptop?.images.length === 0 ? 'Grades B, C, and F require at least one photo' : null,
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
    console.log('Updated Non-Laptop:', { id: nonLaptop?.ID, ...data });
  };

  return (
    <GenericForm
      initialData={initialData}
      fields={fields}
      onSubmit={handleSubmit}
      basePath="/non-pc"
      itemId={id}
      isEdit={true}
    />
  );
}

export default NonPCEdit;