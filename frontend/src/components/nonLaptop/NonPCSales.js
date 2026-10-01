import RequestFailure from '../common/RequestFailure';
import { apiFetch } from '../common/access';
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import GenericForm from '../common/GenericForm';
import { requireOk, readJson } from '../common/requestResult';
import { ClipLoader } from 'react-spinners';
import { gradeMapping } from '../common/GradeMapping';

function NonPCSales() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [nonLaptop, setNonLaptop] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [initialData] = useState({
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


  useEffect(() => {
      apiFetch(`http://${window.location.hostname}:8088/non_laptop/item/api/${id}`)
        .then(readJson)
        .then((data) => setNonLaptop(data))
        .catch(err => setLoadError(err.message || 'Unable to load this record. Please try again.'));
    }, [id]);

  const handleSubmit = (data) => {
    const form = new FormData();
    form.append('id', id);
    form.append('order', data.orderNumber);

    return apiFetch(`http://${window.location.hostname}:8088/non_laptop/sales/order`, {
      method: 'POST', body: form,
    }).then(requireOk).then(() => ({ success: true }));
  };

  if (loadError) return <RequestFailure error={loadError} basePath="/non-pc" />;

  if (!nonLaptop) {
    return (
      <div role="status" aria-label="Loading record" className="p-6 flex justify-center items-center">
        <ClipLoader color="#4B5563" size={40} />
      </div>
    );
  }

  return (
    <div className="app-page app-form">
      <h1 className="text-2xl font-bold mb-4">Non-PC Sales</h1>
      <button
        onClick={() => navigate(`/non-pc/${id}`)}
        className="mb-4 app-button secondary"
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

          <GenericForm
            initialData={initialData}
            fields={fields}
            onSubmit={handleSubmit}
            basePath={`/non-pc/${id}`}
            hideBackButton={true}
          />
    </div>
  );
}

export default NonPCSales;
