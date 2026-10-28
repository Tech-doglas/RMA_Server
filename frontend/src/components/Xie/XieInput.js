import { readJson, requireOk } from '../common/requestResult';
import { apiFetch, authState } from '../common/access';
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Toast from '../common/Toast';

function XieInput({handleLogout}) {
  const [toast, setToast] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const returnIdStart = useRef(null);
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
    const auth = authState();
    if (auth.username) setCurrentUser(auth.username);
    else handleLogout?.();
  }, [handleLogout]);

  const emptyItem = index => ({
    orderNumber: '', laptopName: '', serialNumber: '', condition: '', location: '', customerName: '', remark: '',
    returnId: returnIdStart.current == null ? '' : `No.${String(returnIdStart.current + index).padStart(5, '0')}`,
    inspectionDate: new Date().toISOString().split('T')[0],
  });

  const handleQtyChange = value => {
    const nextQty = Math.min(100, Math.max(1, parseInt(value, 10) || 1));
    const removingData = items.slice(nextQty).some(item => ['orderNumber', 'laptopName', 'serialNumber', 'condition', 'location', 'customerName', 'remark'].some(key => item[key]));
    if (removingData && !window.confirm('Reducing the quantity will remove the last items and their entered details. Continue?')) return;
    setQty(nextQty);
    setItems(current => Array.from({ length: nextQty }, (_, index) => current[index] || emptyItem(index)));
  };

  useEffect(() => {
    let active = true;
    apiFetch(`http://${window.location.hostname}:8088/xie/api/return_number`)
      .then(readJson)
      .then(data => {
        if (!active) return;
        const start = (Number(data.max_id) || 0) + 1;
        returnIdStart.current = start;
        setItems(current => current.map((item, index) => ({ ...item, returnId: item.returnId || `No.${String(start + index).padStart(5, '0')}` })));
      })
      .catch(error => { if (active) setToast({ type: 'error', message: error.message || 'Unable to prepare return IDs. Please reload and try again.' }); });
    return () => { active = false; };
  }, []);

  const handleItemChange = (index, field, value) => {
    setItems(current => current.map((item, position) => position === index ? { ...item, [field]: value } : item));
  };

  const validateFields = () => {
    let tempErrors = {};
    if (!trackingNumber.trim()) tempErrors.trackingNumber = 'Tracking Number is required';
    if (!trackingReceivedDate) tempErrors.trackingReceivedDate = 'Tracking Received Date is required';
    if (!returnType) tempErrors.returnType = 'Return Type is required';
    if (!currentUser) tempErrors.user = 'User is required';

    items.forEach((item, index) => {
      if (!item.laptopName.trim()) tempErrors[`laptopName-${index}`] = 'Laptop Name is required';
      if (!item.serialNumber.trim()) tempErrors[`serialNumber-${index}`] = 'Serial Number is required';
      if (!item.condition) tempErrors[`condition-${index}`] = 'Condition is required';
      if (!item.inspectionDate) tempErrors[`inspectionDate-${index}`] = 'Inspection Date is required';
    });

    setErrors(tempErrors);
    return Object.keys(tempErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (submitting || !validateFields()) return;

    const payload = items.map(item => ({
      trackingNumber,
      trackingReceivedDate,
      returnType,
      user: currentUser,
      ...item,
    }));

    if (!currentUser || currentUser === 'Unknown User') {
      setToast({ message: 'Failed to Submit, User name is empty. Try Relogin again', type: 'error' });
      return; // Stop submission if user is unknown
    }

    setSubmitting(true);
    try {
      const response = await apiFetch(`http://${window.location.hostname}:8088/xie/api/xie-insert`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ data: payload }),
      });

      await requireOk(response);
      navigate('/xie');
    } catch (error) {
      setToast({ type: 'error', message: error.message || 'Unable to save these items. Please try again.' });
    } finally { setSubmitting(false); }
  };

  const handlePrint = () => {
    if (items.some(item => !item.returnId.trim())) { setToast({ type: 'error', message: 'Enter a Return ID for every item before printing.' }); return; }
    const printWindow = window.open('', '_blank');
    if (!printWindow) { setToast({ type: 'error', message: 'Allow pop-ups for this site to print labels.' }); return; }
    printWindow.opener = null;
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

        </body>
      </html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
    items.forEach(item => {
      const label = printWindow.document.createElement('div');
      label.className = 'label';
      label.textContent = item.returnId;
      printWindow.document.body.appendChild(label);
    });
    printWindow.focus();
    printWindow.print();
  };


  return (
    <>
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
      <div className="app-page app-form">
        <h1 className="text-2xl font-bold mb-4">Xie Input</h1>

        {/* Action Buttons Top */}
        <div className="app-actions mb-6">
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="bg-green-500 hover:bg-green-600 text-white px-6 py-2 rounded"
          >
            {submitting ? 'Submitting…' : 'Submit'}
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

        <fieldset disabled={submitting}>
        {/* Top Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="flex flex-col">
            <label className="text-sm font-bold mb-1">Tracking Number</label>
            <input
              type="text"
              aria-label="Tracking Number"
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
              min="1"
              max="100"
              aria-label="Quantity"
              value={qty}
              onChange={(e) => handleQtyChange(e.target.value)}
              className="p-2 border rounded"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-sm font-bold mb-1">Tracking Received Date</label>
            <input
              type="date"
              aria-label="Tracking Received Date"
              value={trackingReceivedDate}
              onChange={(e) => setTrackingReceivedDate(e.target.value)}
              className="p-2 border rounded"
            />
            {errors.trackingReceivedDate && <p className="text-red-500 text-sm mt-1">{errors.trackingReceivedDate}</p>}
          </div>
          <div className="flex flex-col">
            <label className="text-sm font-bold mb-1">Return Type</label>
            <select
              aria-label="Return Type"
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
              aria-label="User"
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
                  aria-label={`Order Number for item ${index + 1}`}
                  value={item.orderNumber}
                  onChange={(e) => handleItemChange(index, 'orderNumber', e.target.value)}
                  className="p-2 border rounded"
                />
              </div>
              <div className="flex flex-col">
                <label className="text-sm font-bold mb-1">Laptop Name</label>
                <input
                  type="text"
                  aria-label={`Laptop Name for item ${index + 1}`}
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
                  aria-label={`Serial Number for item ${index + 1}`}
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
                  aria-label={`Location for item ${index + 1}`}
                  value={item.location}
                  onChange={(e) => handleItemChange(index, 'location', e.target.value)}
                  className="p-2 border rounded"
                />
              </div>
              <div className="flex flex-col">
                <label className="text-sm font-bold mb-1">Customer Name</label>
                <input
                  type="text"
                  aria-label={`Customer Name for item ${index + 1}`}
                  value={item.customerName}
                  onChange={(e) => handleItemChange(index, 'customerName', e.target.value)}
                  className="p-2 border rounded"
                />
              </div>
              <div className="flex flex-col">
                <label className="text-sm font-bold mb-1">Remark</label>
                <textarea
                  aria-label={`Remark for item ${index + 1}`}
                  value={item.remark}
                  onChange={(e) => handleItemChange(index, 'remark', e.target.value)}
                  className="p-2 border rounded"
                />
              </div>
              <div className="flex flex-col">
                <label className="text-sm font-bold mb-1">Return ID</label>
                <input
                  type="text"
                  aria-label={`Return ID for item ${index + 1}`}
                  value={item.returnId}
                  onChange={(e) => handleItemChange(index, 'returnId', e.target.value)}
                  className="p-2 border rounded"
                />
              </div>
              <div className="flex flex-col">
                <label className="text-sm font-bold mb-1">Inspection Date</label>
                <input
                  type="date"
                  aria-label={`Inspection Date for item ${index + 1}`}
                  value={item.inspectionDate}
                  onChange={(e) => handleItemChange(index, 'inspectionDate', e.target.value)}
                  className="p-2 border rounded"
                />
                {errors[`inspectionDate-${index}`] && <p className="text-red-500 text-sm mt-1">{errors[`inspectionDate-${index}`]}</p>}
              </div>
              <div className="flex flex-col">
                <label className="text-sm font-bold mb-1">Condition</label>
                <select
                  aria-label={`Condition for item ${index + 1}`}
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
        </fieldset>
      </div>
    </>
  );
}

export default XieInput;
