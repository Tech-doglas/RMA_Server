import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import GenericForm from '../common/GenericForm';
import { ClipLoader } from 'react-spinners';
import { gradeMapping } from '../common/GradeMapping';

function NonPCSales() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [nonLaptop, setNonLaptop] = useState(null);
  const [initialData, setInitialData] = useState({
    orderNumber: ''
  });

  const fields = [
    {
      name: 'orderNumber',
      label: 'Order Number',
      type: 'text',
      required: true,
      placeholder: 'e.g., 256212333-A',
    }
  ];

  console.log(nonLaptop)

  useEffect(() => {
      fetch(`http://${window.location.hostname}:8088/non_laptop/item/api/${id}`)
        .then((res) => res.json())
        .then((data) => setNonLaptop(data))
        .catch((err) => console.error("Error fetching laptop:", err));
    }, [id]);

  const handleSubmit = (data) => {
    const form = new FormData();
    form.append('id', id);
    form.append('order', data.orderNumber);

    fetch(`http://${window.location.hostname}:8088/non_laptop/sales/order`, {
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

  if (!nonLaptop) {
    return (
      <div className="p-6 flex justify-center items-center">
        <ClipLoader color="#4B5563" size={40} />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Non pc Sales</h1>
      <button
        onClick={() => navigate(`/non-pc/${id}`)}
        className="mb-4 bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
      >
        Back
      </button>

      <div className="bg-white p-4 rounded-lg shadow mb-4">
        <table className="w-full border-collapse">
          <tbody>
            <tr className="border-b"><th className="p-2 text-left">Name</th><td className="p-2">{nonLaptop.Name}</td></tr>
            <tr className="border-b"><th className="p-2 text-left">Category</th><td className="p-2">{nonLaptop.Category}</td></tr>
            <tr className="border-b"><th className="p-2 text-left">Condition</th><td className="p-2">{gradeMapping(nonLaptop.Condition)}</td></tr>
            <tr className="border-b"><th className="p-2 text-left">SKU</th><td className="p-2">{nonLaptop.SKU}</td></tr>
            <tr className="border-b"><th className="p-2 text-left">Odoo Code</th><td className="p-2">{nonLaptop.OdooRef}</td></tr>
          </tbody>
        </table>
      </div>

      <div className="max-w-3xl mx-auto p-4">
        <div className="bg-white rounded shadow p-6">
          <GenericForm
            initialData={initialData}
            fields={fields}
            onSubmit={handleSubmit}
            basePath={`/non-pc/${id}`}
            hideBackButton={true}
          />
        </div>
      </div>
    </div>
  );
}

export default NonPCSales;
