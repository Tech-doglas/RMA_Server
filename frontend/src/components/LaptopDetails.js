import React from 'react';
import { useParams, Link } from 'react-router-dom';
import DetailView from './common/DetailView';
import laptops from '../data/laptops';

function LaptopDetails() {
  const { id } = useParams();
  const laptop = laptops.find((l) => l.ID === parseInt(id));

  const fields = [
    { key: 'Brand', label: 'Brand' },
    { key: 'Model', label: 'Model' },
    { key: 'Spec', label: 'Specification', render: (item) => item.UpDatedSpec ? (<><s>{item.Spec}</s> → {item.UpDatedSpec}</>) : item.Spec },
    { key: 'SerialNumber', label: 'Serial Number' },
    { key: 'OdooRef', label: 'Odoo Code' },
    { key: 'Condition', label: 'Condition', render: (item) => item.Condition === 'N' ? 'Back to New' : `Grade ${item.Condition}` },
    { key: 'Stock', label: 'Stock', className: (item) => item.Stock === 'SOLD' ? 'text-red-500' : '' },
    { key: 'SKU', label: 'SKU' },
    { key: 'OrderNumber', label: 'Order Number' },
    { key: 'Sealed', label: 'Sealed', render: (item) => item.Sealed ? '✅' : '❌' },
    { key: 'OdooRecord', label: 'Odoo Record', render: (item) => item.OdooRecord ? '✅' : '❌' },
    { key: 'TechDone', label: 'Tech Done', render: (item) => item.TechDone ? '✅' : '❌' },
    { key: 'Remark', label: 'Remark' },
    { key: 'LastModifiedUser', label: 'Last Edited User' },
    { key: 'LastModifiedDateTime', label: 'Last Edited DateTime' },
  ];

  const actions = [
    {
      label: 'Sales',
      className: laptop?.Stock === 'SOLD' ? 'bg-gray-400 cursor-not-allowed' : 'bg-sky-500 hover:bg-sky-600',
      disabled: laptop?.Stock === 'SOLD',
      render: () => (
        <Link
          to={laptop?.Stock === 'SOLD' ? '#' : `/pc/${id}/sales`}
          className={`inline-block px-4 py-2 rounded text-white ${
            laptop?.Stock === 'SOLD' ? 'bg-gray-400 cursor-not-allowed' : 'bg-sky-500 hover:bg-sky-600'
          }`}
          onClick={(e) => {
            if (laptop?.Stock === 'SOLD') {
              e.preventDefault(); // Prevent navigation if disabled
            }
          }}
        >
          Sales
        </Link>
      ),
    },
    {
      label: 'Edit',
      className: 'bg-orange-500 hover:bg-orange-600',
      render: () => <Link to={`/pc/${id}/edit`} className="inline-block bg-orange-500 text-white px-4 py-2 rounded hover:bg-orange-600">Edit</Link>,
    },
    {
      label: 'Done',
      onClick: () => console.log('Marked as Tech Done:', laptop?.ID),
      className: laptop?.Stock !== 'SOLD' || laptop?.TechDone ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-500 hover:bg-green-600',
      disabled: laptop?.Stock !== 'SOLD' || laptop?.TechDone,
    },
  ];

  return (
    <DetailView
      item={laptop}
      fields={fields}
      basePath="/pc"
      itemId={id}
      actions={actions}
    />
  );
}

export default LaptopDetails;