import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation  } from 'react-router-dom';

function XieInput() {
  const location = useLocation();
  const [trackingNumber, setTrackingNumber] = useState(location.state?.trackingNumber || '');
  const [qty, setQty] = useState(1);
  const [trackingReceivedDate, setTrackingReceivedDate] = useState(location.state?.trackingReceivedDate || '');
  const [returnType, setReturnType] = useState(location.state?.returnType || '');
  const [items, setItems] = useState([
    {
      orderNumber: '',
      laptopName: '',
      serialNumber: '',
      condition: '',
      location: '',
      customerName: '',
      remark: '',
      returnId: '',
      inspectionDate: new Date().toISOString().split('T')[0],
    },
  ]);
  const [errors, setErrors] = useState({});
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState('');

  useEffect(() => {
    const savedAuth = localStorage.getItem('auth');
    if (savedAuth) {
      const parsed = JSON.parse(savedAuth);
      setCurrentUser(parsed.username || 'Unknown User');
    }
  }, []);

  const handleQtyChange = async (value) => {
    const today = new Date().toISOString().split('T')[0];
    const parsedQty = Math.max(0, parseInt(value) || 0);
    setQty(parsedQty);
  
    try {
      const res = await fetch(`http://${window.location.hostname}:8088/xie/api/return_number`);
      const data = await res.json();
      const start = (data.max_id || 0) + 1;
  
      const newItems = Array.from({ length: parsedQty }, (_, idx) => ({
        orderNumber: '',
        laptopName: '',
        serialNumber: '',
        condition: '',
        location: '',
        customerName: '',
        remark: '',
        returnId: `No.${String(start + idx).padStart(5, '0')}`,
        inspectionDate: today,
      }));
  
      setItems(newItems);
    } catch (error) {
      console.error('Failed to fetch return numbers:', error);
      // fallback without returnId if fetch fails
      const newItems = Array.from({ length: parsedQty }, () => ({
        orderNumber: '',
        laptopName: '',
        serialNumber: '',
        condition: '',
        location: '',
        customerName: '',
        remark: '',
        returnId: '',
        inspectionDate: today,
      }));
      setItems(newItems);
    }
  };

  useEffect(() => {
    const fetchReturnIdAndSetItems = async () => {
      try {
        const res = await fetch(`http://${window.location.hostname}:8088/xie/api/return_number`);
        const data = await res.json();
        const start = (data.max_id || 0) + 1;
        const today = new Date().toISOString().split('T')[0];
  
        const newItems = Array.from({ length: qty }, (_, idx) => ({
          orderNumber: '',
          laptopName: '',
          serialNumber: '',
          condition: '',
          location: '',
          customerName: '',
          remark: '',
          returnId: `No.${String(start + idx).padStart(5, '0')}`,
          inspectionDate: today,
        }));
  
        setItems(newItems);
      } catch (err) {
        console.error('Failed to prefill return IDs:', err);
      }
    };
  
    fetchReturnIdAndSetItems();
  }, []);
  
  

  const handleItemChange = (index, field, value) => {
    const updatedItems = [...items];
    updatedItems[index][field] = value;
    setItems(updatedItems);
  };

  const validateFields = () => {
    let tempErrors = {};
    if (!trackingNumber) tempErrors.trackingNumber = 'Tracking Number is required';
    if (!trackingReceivedDate) tempErrors.trackingReceivedDate = 'Tracking Received Date is required';
    if (!returnType) tempErrors.returnType = 'Return Type is required';
    if (!currentUser) tempErrors.user = 'User is required';

    items.forEach((item, index) => {
      if (!item.laptopName) tempErrors[`laptopName-${index}`] = 'Laptop Name is required';
      if (!item.serialNumber) tempErrors[`serialNumber-${index}`] = 'Serial Number is required';
      if (!item.condition) tempErrors[`condition-${index}`] = 'Condition is required';
      if (!item.inspectionDate) tempErrors[`inspectionDate-${index}`] = 'Inspection Date is required';
    });

    setErrors(tempErrors);
    return Object.keys(tempErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateFields()) return;

    const payload = items.map(item => ({
      trackingNumber,
      trackingReceivedDate,
      returnType,
      user: currentUser,
      ...item,
    }));

    try {
      const response = await fetch(`http://${window.location.hostname}:8088/xie/api/xie-insert`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ data: payload }),
      });

      if (!response.ok) {
        throw new Error('Failed to submit data.');
      }

      alert('Data submitted successfully!');
      navigate('/xie');
    } catch (error) {
      console.error(error);
      alert('Failed to submit data.');
    }
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    const html = `
      <html>
        <head>
          <style>
            @page {
              size: 90mm 29mm;
              margin: 0;
            }
            body {
              margin: 0;
              font-family: sans-serif;
            }
            .label {
              display: flex;
              justify-content: center;
              align-items: center;
              width: 90mm;
              height: 29mm;
              font-size: 32pt;
              font-weight: bold;
              page-break-after: always;
            }
          </style>
        </head>
        <body>
          ${items.map(item => `<div class="label">${item.returnId}</div>`).join('')}
        </body>
      </html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };
  

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Xie Input</h1>

      {/* Action Buttons Top */}
      <div className="flex gap-4 mb-6">
        <button
          onClick={handleSubmit}
          className="bg-green-500 hover:bg-green-600 text-white px-6 py-2 rounded"
        >
          Submit
        </button>
        <button
          onClick={handlePrint}
          className="bg-sky-500 hover:bg-sky-600 text-white px-6 py-2 rounded"
        >
          Print Return ID
        </button>
        <button
          onClick={() => navigate('/xie')}
          className="bg-gray-500 hover:bg-gray-600 text-white px-6 py-2 rounded"
        >
          Back
        </button>
      </div>

      {/* Top Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="flex flex-col">
          <label className="text-sm font-bold mb-1">Tracking Number</label>
          <input
            type="text"
            value={trackingNumber}
            onChange={(e) => setTrackingNumber(e.target.value)}
            className="p-2 border rounded"
          />
          {errors.trackingNumber && <p className="text-red-500 text-sm mt-1">{errors.trackingNumber}</p>}
        </div>
        <div className="flex flex-col">
          <label className="text-sm font-bold mb-1">Qty</label>
          <input
            type="number"
            value={qty}
            onChange={(e) => handleQtyChange(e.target.value)}
            className="p-2 border rounded"
          />
        </div>
        <div className="flex flex-col">
          <label className="text-sm font-bold mb-1">Tracking Received Date</label>
          <input
            type="date"
            value={trackingReceivedDate}
            onChange={(e) => setTrackingReceivedDate(e.target.value)}
            className="p-2 border rounded"
          />
          {errors.trackingReceivedDate && <p className="text-red-500 text-sm mt-1">{errors.trackingReceivedDate}</p>}
        </div>
        <div className="flex flex-col">
          <label className="text-sm font-bold mb-1">Return Type</label>
          <select
            value={returnType}
            onChange={(e) => setReturnType(e.target.value)}
            className="p-2 border rounded"
          >
            <option value="">Select Return Type</option>
            <option value="BULK_NEW">BULK_NEW</option>
            <option value="REGULAR">REGULAR</option>
          </select>
          {errors.returnType && <p className="text-red-500 text-sm mt-1">{errors.returnType}</p>}
        </div>
        <div className="flex flex-col">
          <label className="text-sm font-bold mb-1">User</label>
          <input
            type="text"
            value={currentUser}
            readOnly
            className="p-2 border rounded bg-gray-100"
          />
          {errors.user && <p className="text-red-500 text-sm mt-1">{errors.user}</p>}
        </div>
      </div>

      {/* Item Rows */}
      {items.map((item, index) => (
        <div key={index} className="border rounded p-4 mb-4 bg-gray-50">
          <h2 className="font-bold mb-2">Item {index + 1}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col">
              <label className="text-sm font-bold mb-1">Order Number</label>
              <input
                type="text"
                value={item.orderNumber}
                onChange={(e) => handleItemChange(index, 'orderNumber', e.target.value)}
                className="p-2 border rounded"
              />
            </div>
            <div className="flex flex-col">
              <label className="text-sm font-bold mb-1">Laptop Name</label>
              <input
                type="text"
                value={item.laptopName}
                onChange={(e) => handleItemChange(index, 'laptopName', e.target.value)}
                className="p-2 border rounded"
              />
              {errors[`laptopName-${index}`] && <p className="text-red-500 text-sm mt-1">{errors[`laptopName-${index}`]}</p>}
            </div>
            <div className="flex flex-col">
              <label className="text-sm font-bold mb-1">Serial Number</label>
              <input
                type="text"
                value={item.serialNumber}
                onChange={(e) => handleItemChange(index, 'serialNumber', e.target.value)}
                className="p-2 border rounded"
              />
              {errors[`serialNumber-${index}`] && <p className="text-red-500 text-sm mt-1">{errors[`serialNumber-${index}`]}</p>}
            </div>
            <div className="flex flex-col">
              <label className="text-sm font-bold mb-1">Location</label>
              <input
                type="text"
                value={item.location}
                onChange={(e) => handleItemChange(index, 'location', e.target.value)}
                className="p-2 border rounded"
              />
            </div>
            <div className="flex flex-col">
              <label className="text-sm font-bold mb-1">Customer Name</label>
              <input
                type="text"
                value={item.customerName}
                onChange={(e) => handleItemChange(index, 'customerName', e.target.value)}
                className="p-2 border rounded"
              />
            </div>
            <div className="flex flex-col">
              <label className="text-sm font-bold mb-1">Remark</label>
              <textarea
                value={item.remark}
                onChange={(e) => handleItemChange(index, 'remark', e.target.value)}
                className="p-2 border rounded"
              />
            </div>
            <div className="flex flex-col">
              <label className="text-sm font-bold mb-1">Return ID</label>
              <input
                type="text"
                value={item.returnId}
                onChange={(e) => handleItemChange(index, 'returnId', e.target.value)}
                className="p-2 border rounded"
              />
            </div>
            <div className="flex flex-col">
              <label className="text-sm font-bold mb-1">Inspection Date</label>
              <input
                type="date"
                value={item.inspectionDate}
                onChange={(e) => handleItemChange(index, 'inspectionDate', e.target.value)}
                className="p-2 border rounded"
              />
              {errors[`inspectionDate-${index}`] && <p className="text-red-500 text-sm mt-1">{errors[`inspectionDate-${index}`]}</p>}
            </div>
            <div className="flex flex-col">
              <label className="text-sm font-bold mb-1">Condition</label>
              <select
                value={item.condition}
                onChange={(e) => handleItemChange(index, 'condition', e.target.value)}
                className="p-2 border rounded"
              >
                <option value="">Select Condition</option>
                <option value="N">New</option>
                <option value="A">Grade A</option>
                <option value="B">Grade B</option>
                <option value="C">Grade C</option>
                <option value="F">Grade F</option>
              </select>
              {errors[`condition-${index}`] && <p className="text-red-500 text-sm mt-1">{errors[`condition-${index}`]}</p>}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default XieInput;