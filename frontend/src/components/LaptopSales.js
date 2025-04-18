import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import GenericForm from './common/GenericForm';
import { ClipLoader } from 'react-spinners';

function LaptopSales() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [laptop, setLaptop] = useState(null);
  const [initialData, setInitialData] = useState({
    orderNumber: '',
    ram: '',
    ssd: '',
  });

  const fields = [
    {
      name: 'orderNumber',
      label: 'Order Number',
      type: 'text',
      required: true,
      placeholder: 'e.g., 256212333-A',
    },
    {
      name: 'ram',
      label: 'RAM',
      type: 'select',
      required: true,
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
    },
    {
      name: 'ssd',
      label: 'Storage',
      type: 'select',
      required: true,
      options: [
        { value: '', label: 'Select Storage', disabled: true },
        { value: '64GB', label: '64GB EMMC SSD' },
        { value: '128GBe', label: '128GB EMMC SSD' },
        { value: '128GB', label: '128GB SSD' },
        { value: '256GB', label: '256GB SSD' },
        { value: '512GB', label: '512GB SSD' },
        { value: '1TB', label: '1TB SSD' },
        { value: '2TB', label: '2TB SSD' },
        { value: '4TB', label: '4TB SSD' },
      ],
    },
  ];

  useEffect(() => {
    fetch(`http://localhost:5000/laptop/item/${id}`)
      .then((res) => res.json())
      .then((data) => {
        setLaptop(data);
        if (data.Spec) {
          const [ram, ssd] = data.Spec.split('+');
          setInitialData({ orderNumber: '', ram, ssd });
        }
      })
      .catch((err) => console.error('Failed to load laptop:', err));
  }, [id]);

  const handleSubmit = (data) => {
    const form = new FormData();
    form.append('id', id);
    form.append('order', data.orderNumber);
    form.append('ram', data.ram);
    form.append('ssd', data.ssd);

    fetch('http://localhost:5000/laptop/sales/order', {
      method: 'POST',
      body: form,
    })
      .then((res) => {
        if (res.redirected) {
          window.location.href = res.url;
        } else {
          return res.text().then(console.log);
        }
      })
      .catch((err) => console.error('Sale submit error:', err));
  };

  if (!laptop) {
    return (
      <div className="p-6 flex justify-center items-center">
        <ClipLoader color="#4B5563" size={40} />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Laptop Sales</h1>
      <button
        onClick={() => navigate(`/pc/${id}`)}
        className="mb-4 bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
      >
        Back
      </button>

      <div className="bg-white p-4 rounded-lg shadow mb-4">
        <table className="w-full border-collapse">
          <tbody>
            <tr className="border-b"><th className="p-2 text-left">Brand</th><td className="p-2">{laptop.Brand}</td></tr>
            <tr className="border-b"><th className="p-2 text-left">Model</th><td className="p-2">{laptop.Model}</td></tr>
            <tr className="border-b"><th className="p-2 text-left">Specification</th><td className="p-2">{laptop.Spec}</td></tr>
            <tr className="border-b"><th className="p-2 text-left">Serial Number</th><td className="p-2">{laptop.SerialNumber}</td></tr>
            <tr className="border-b"><th className="p-2 text-left">Condition</th><td className="p-2">{laptop.Condition === 'N' ? 'Back to New' : `Grade ${laptop.Condition}`}</td></tr>
          </tbody>
        </table>
      </div>

      <div className="max-w-3xl mx-auto p-4">
        <div className="bg-white rounded shadow p-6">
          <GenericForm
            initialData={initialData}
            fields={fields}
            onSubmit={handleSubmit}
            basePath={`/pc/${id}`}
            hideBackButton={true}
          />
        </div>
      </div>
    </div>
  );
}

export default LaptopSales;
