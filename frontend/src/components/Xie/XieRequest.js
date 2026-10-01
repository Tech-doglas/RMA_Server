import { apiFetch } from '../common/access';
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { readJson } from '../common/requestResult';

function XieRequest() {
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);

  const columns = [
    { key: "tracking_number", label: "Tracking Number" },
    { key: "fba_order_number", label: "FBA Order Number" },
    { key: "product_name", label: "Product Name" },
    { key: "fnsku", label: "FNSKU" },
    { key: "qty", label: "Qty" },
    // { key: "expected_delivery_date", label: "Expected Delivery Date" },
  ];

  const [formValues, setFormValues] = useState(
    columns.reduce((acc, col) => ({ ...acc, [col.key]: "" }), {})
  );

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormValues((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError('');
    setSaved(false);
    try {
      const response = await apiFetch(`http://${window.location.hostname}:8088/xie/api/request`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formValues),
      });
      await readJson(response);
      setSaved(true);
    } catch (failure) { setError(failure.status === 501 ? 'Request submission is not configured. Contact an admin.' : failure.message || 'Unable to submit. Please try again.'); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="app-page">
      {/* Top Header Section */}
      <div className="sticky top-0 z-50 bg-gray-100">
        <h1 className="text-2xl font-bold mb-4">SnowBell Request</h1>
        <div className="app-actions mb-4">
          <button
            onClick={() => navigate("/xie")}
            className="bg-orange-500 text-white px-4 py-2 rounded hover:bg-orange-600"
          >
            Back
          </button>
        </div>
      </div>

      {/* Submit Section */}
      <div className="bg-white p-4 rounded-lg shadow mb-4">
        {error && <p role="alert" className="text-red-800 mb-4">{error}</p>}
        {saved && <p role="status" className="mb-4">Request saved.</p>}
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            {columns.map((col) => (
              <div key={col.key}>
                <label htmlFor={col.key} className="block text-gray-700 font-bold mb-2">
                  {col.label}
                </label>
                <input
                  type={
                    col.key === "qty" ? "number" : "text"
                  }
                  id={col.key}
                  name={col.key}
                  disabled={submitting}
                  required
                  min={col.key === "qty" ? 1 : undefined}
                  value={formValues[col.key]}
                  onChange={handleInputChange}
                  className="w-full p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-600"
                  placeholder={col.label}
                />
              </div>
            ))}
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={submitting}
              className="bg-green-600 hover:bg-green-700 text-white font-semibold px-6 py-2 rounded shadow"
            >
              {submitting ? 'Submitting…' : 'Submit'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default XieRequest;
