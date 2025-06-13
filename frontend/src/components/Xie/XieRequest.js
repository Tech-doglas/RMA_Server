import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import GroupedGenericList from "../common/GroupedGenericList";

function XieRequest() {
  const navigate = useNavigate();
  const [requestItem, setRequestItem] = useState([]);

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

  const handleSubmit = (e) => {
    e.preventDefault();
    console.log("Submitted values:", formValues);
        fetch(`http://${window.location.hostname}:8088/xie/api/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formValues),
    })
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setRequestItem(data);
        } else {
          console.error("Unexpected data format:", data);
          setRequestItem([])
        }
      })
      .catch((err) => {
        console.error("Fetch error:", err);
        setRequestItem([])
      });
  };

  return (
    <div className="p-6">
      {/* Top Header Section */}
      <div className="sticky top-0 z-50 bg-gray-100">
        <h1 className="text-2xl font-bold mb-4">SnowBell Return List</h1>
        <div className="flex space-x-2 mb-4">
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
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            {columns.map((col) => (
              <div key={col.key}>
                <label className="block text-gray-700 font-bold mb-2">
                  {col.label}
                </label>
                <input
                  type={
                    col.key.toLowerCase().includes("date") ? "date" : "text"
                  }
                  name={col.key}
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
              className="bg-green-600 hover:bg-green-700 text-white font-semibold px-6 py-2 rounded shadow"
            >
              ✅ Submit
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default XieRequest;
