import React from 'react';
import { useParams } from 'react-router-dom';
import GenericForm from './common/GenericForm';
import laptops from '../data/laptops';

function LaptopEdit() {
  const { id } = useParams();
  const laptop = laptops.find((l) => l.ID === parseInt(id));

  const initialData = {
    brand: laptop?.Brand || '',
    model: laptop?.Model || '',
    spec: laptop?.Spec || '',
    updatedSpec: laptop?.UpDatedSpec || '',
    serialNumber: laptop?.SerialNumber || '',
    condition: laptop?.Condition || '',
    sealed: laptop?.Sealed || false,
    odooRecord: laptop?.OdooRecord || false,
    odooRef: laptop?.OdooRef || '',
    sku: laptop?.SKU || '',
    stock: laptop?.Stock === 'SOLD',
    orderNumber: laptop?.OrderNumber || '',
    remark: laptop?.Remark || '',
    newImages: [],
    user: laptop?.LastModifiedUser || '',
  };

  const fields = [
    {
      name: 'brand',
      label: 'Brand',
      type: 'select',
      options: [
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
      required: true,
    },
    {
      name: 'spec',
      label: 'Specification',
      type: 'text',
      required: true,
    },
    {
      name: 'updatedSpec',
      label: 'Updated Specification',
      type: 'text',
    },
    {
      name: 'serialNumber',
      label: 'Serial Number',
      type: 'text',
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
      name: 'odooRef',
      label: 'Odoo Code',
      type: 'text',
    },
    {
      name: 'sku',
      label: 'SKU',
      type: 'text',
    },
    {
      name: 'stock',
      label: 'Stock (SOLD)',
      type: 'checkbox',
    },
    {
      name: 'orderNumber',
      label: 'Order Number',
      type: 'text',
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
      validate: (value, formData) => ['B', 'C', 'F'].includes(formData.condition) && value.length === 0 && laptop?.images.length === 0 ? 'Grades B, C, and F require at least one photo' : null,
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
    console.log('Updated Laptop:', { id: laptop?.ID, ...data });
  };

  return (
    <GenericForm
      initialData={initialData}
      fields={fields}
      onSubmit={handleSubmit}
      basePath="/pc"
      itemId={id}
      isEdit={true}
    />
  );
}

export default LaptopEdit;