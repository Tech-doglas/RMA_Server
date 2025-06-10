import React, { useState, useEffect } from 'react';
import GenericForm from '../common/GenericForm';
import { toSQLServerDateString } from '../common/formatToEDT';

function NonPCInput() {
  const [userOptions, setUserOptions] = useState([]);

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
      ]
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
      validate: (value) => {
        if (!value || value.length === 0) {
          return 'Please upload at least one shipping label image';
        }
        return null;
      },
    },
    {
      name: 'user',
      label: 'User',
      type: 'select',
      options: userOptions,
      required: true,
    },
  ];

  const handleSubmit = async (formData) => {
    try {
      const data = new FormData();

      const ssmsDate = toSQLServerDateString(formData.receivedDate);
  
      // Append basic fields
      data.append('tracking_number', formData.trackingNumber);
      data.append('received_date', ssmsDate);
      data.append('category', formData.category);
      data.append('name', formData.name);
      data.append('OdooRef', formData.odooRef);
      data.append('condition', formData.condition);
      data.append('qty', formData.qty);
      data.append('location', formData.location);
      data.append('remark', formData.remark);
      data.append('user', formData.user);

  
      // Append images
      if (formData.images && formData.images.length > 0) {
        const images = Array.from(formData.images);
        images.forEach((file) => {
          data.append('images', file);
        });
      }
      
      const response = await fetch(`http://${window.location.hostname}:8088/non_laptop/item/submit`, {
        method: 'POST',
        body: data,
      });
  
      if (response.redirected) {
        setTimeout(() => window.location.href = response.url, 500);
      } else {
        const text = await response.text();
      }
    } catch (error) {
    }
  };

  useEffect(() => {
    fetch(`http://${window.location.hostname}:8088/auth/api/users`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setUserOptions([
            { value: '', label: 'Select User', disabled: true },
            ...data.map((user) => ({ value: user, label: user })),
          ]);
        }
      })
      .catch((err) => console.error('Error fetching users:', err));
  }, []);

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