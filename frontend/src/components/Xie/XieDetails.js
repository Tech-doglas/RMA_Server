import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";

function XieDetails() {
  const { trackingNumber } = useParams();
  const [items, setItems] = useState([]);
  const [images, setImages] = useState([]);
  const navigate = useNavigate();

  const formatDate = (dateString) => {
    if (!dateString) return "-";
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "-";

    const day = String(date.getDate()).padStart(2, "0");
    const month = date.toLocaleString("en-US", { month: "short" }); // like 'Apr'
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");

    return `${day}/${month}/${year} ${hours}:${minutes}`;
  };

  useEffect(() => {
    fetch(`http://${window.location.hostname}:8088/xie/api/tracking/${trackingNumber}`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setItems(data);
        } else {
          console.error("Unexpected data format", data);
        }
      })
      .catch((err) => console.error("Fetch error:", err));
    fetch(`http://${window.location.hostname}:8088/images/api/return_receiving/${trackingNumber}`)
      .then((res) => res.json())
      .then((data) => setImages({ list: data, type: 'return_receiving' }))
      .catch((err) => console.error('Error fetching images:', err));
  }, [trackingNumber]);

  const shared = items[0] || {}; // grab shared fields from first item

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Tracking Details</h1>
        <button
          onClick={() => navigate("/xie")}
          className="bg-gray-500 hover:bg-gray-600 text-white px-6 py-2 rounded"
        >
          ← Back
        </button>
      </div>

      {/* Shared Info */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-gray-100 p-4 rounded mb-6">
        <div>
          <p className="text-sm text-gray-600 font-semibold">Tracking Number</p>
          <p className="text-lg font-bold">{shared.tracking_number || trackingNumber}</p>
        </div>
        <div>
          <p className="text-sm text-gray-600 font-semibold">Tracking Received Date</p>
          <p className="text-lg font-bold">{formatDate(shared.tracking_received_date)}</p>
        </div>
        <div>
          <p className="text-sm text-gray-600 font-semibold">Return Type</p>
          <p className="text-lg font-bold">{shared.return_type}</p>
        </div>
        <div>
          <p className="text-sm text-gray-600 font-semibold">Last Modified By</p>
          <p className="text-lg font-bold">{shared.last_modified_user || '-'}</p>
        </div>
        <div>
          <p className="text-sm text-gray-600 font-semibold">Last Modified At</p>
          <p className="text-lg font-bold">{formatDate(shared.last_modified_datetime)}</p>
        </div>
      </div>

      {/* Item Table */}
      {items.length === 0 ? (
        <p>No items found.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse bg-white shadow rounded">
            <thead>
              <tr className="bg-gray-200">
                <th className="p-2 border">#</th>
                <th className="p-2 border">Order Number</th>
                <th className="p-2 border">Laptop Name</th>
                <th className="p-2 border">Customer Name</th>
                <th className="p-2 border">Serial Number</th>
                <th className="p-2 border">Return ID</th>
                <th className="p-2 border">Condition</th>
                <th className="p-2 border">Location</th>
                <th className="p-2 border">Inspection Date</th>
                <th className="p-2 border">Remark</th>
                <th className="p-2 border">Delivery Date</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => (
                <tr key={item.id || index}>
                  <td className="p-2 border text-center">{index + 1}</td>
                  <td className="p-2 border">{item.order_number}</td>
                  <td className="p-2 border">{item.laptop_name}</td>
                  <td className="p-2 border">{item.customer_name}</td>
                  <td className="p-2 border">{item.serial_number}</td>
                  <td className="p-2 border">{item.return_id}</td>
                  <td className="p-2 border text-center">{item.condition}</td>
                  <td className="p-2 border">{item.location}</td>
                  <td className="p-2 border">{formatDate(item.inspection_date)}</td>
                  <td className="p-2 border">{item.remark}</td>
                  <td className="p-2 border">{formatDate(item.delivery_date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-6">
            <h2 className="text-xl font-bold mb-2">Images</h2>
            {images?.list && images?.list?.length > 0 ? (
              <div className="flex flex-wrap gap-4">
                {images.list.map((filename) => (
                  <div key={filename} className="relative">
                    <img
                      src={`http://${window.location.hostname}:8088/images/return_receiving/${trackingNumber}/${filename}`}
                      alt={filename}
                      className="w-[600px] h-auto rounded shadow"
                    />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500">No images available for this item.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default XieDetails;
