import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import laptops from '../data/laptops';

function LaptopSales() {
  const { id } = useParams();
  const navigate = useNavigate();
  const laptop = laptops.find((l) => l.ID === parseInt(id));
  const [formData, setFormData] = useState({
    orderNumber: '',
    ram: laptop?.Spec.split('+')[0] || '',
    ssd: laptop?.Spec.split('+')[1] || '',
  });
  const [errors, setErrors] = useState({});

  if (!laptop) {
    return <div className="p-6">No laptop found with this ID.</div>;
  }

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const validateForm = () => {
    const newErrors = {};
    if (!formData.orderNumber) newErrors.orderNumber = 'Order Number is required';
    if (!formData.ram) newErrors.ram = 'RAM is required';
    if (!formData.ssd) newErrors.ssd = 'Storage is required';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (validateForm()) {
      // Simulate marking as sold (in a real app, this would be an API call)
      console.log('Laptop Sold:', { id: laptop.ID, ...formData });
      navigate(`/pc/${id}`);
    }
  };

  return (
    <div className="p-6">
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
            <tr className="border-b">
              <th className="p-2 text-left">Brand</th>
              <td className="p-2">{laptop.Brand}</td>
            </tr>
            <tr className="border-b">
              <th className="p-2 text-left">Model</th>
              <td className="p-2">{laptop.Model}</td>
            </tr>
            <tr className="border-b">
              <th className="p-2 text-left">Specification</th>
              <td className="p-2">{laptop.Spec}</td>
            </tr>
            <tr className="border-b">
              <th className="p-2 text-left">Serial Number</th>
              <td className="p-2">{laptop.SerialNumber}</td>
            </tr>
            <tr className="border-b">
              <th className="p-2 text-left">Condition</th>
              <td className="p-2">
                {laptop.Condition === 'N' ? 'Back to New' : `Grade ${laptop.Condition}`}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="mb-4">
          <label className="block text-gray-700 font-bold mb-2" htmlFor="orderNumber">
            Order Number
          </label>
          <input
            type="text"
            id="orderNumber"
            name="orderNumber"
            value={formData.orderNumber}
            onChange={handleChange}
            className="w-full p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-600"
            placeholder="e.g., 256212333-A"
          />
          {errors.orderNumber && (
            <p className="text-red-500 text-sm mt-1">{errors.orderNumber}</p>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-gray-700 font-bold mb-2" htmlFor="ram">
              RAM
            </label>
            <select
              id="ram"
              name="ram"
              value={formData.ram}
              onChange={handleChange}
              className="w-full p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="" disabled>
                Select RAM
              </option>
              <option value="4GB">4GB</option>
              <option value="8GB">8GB</option>
              <option value="12GB">12GB</option>
              <option value="16GB">16GB</option>
              <option value="24GB">24GB</option>
              <option value="32GB">32GB</option>
              <option value="40GB">40GB</option>
              <option value="48GB">48GB</option>
              <option value="64GB">64GB</option>
            </select>
            {errors.ram && <p className="text-red-500 text-sm mt-1">{errors.ram}</p>}
          </div>
          <div>
            <label className="block text-gray-700 font-bold mb-2" htmlFor="ssd">
              Storage
            </label>
            <select
              id="ssd"
              name="ssd"
              value={formData.ssd}
              onChange={handleChange}
              className="w-full p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="" disabled>
                Select storage
              </option>
              <option value="64GB">64GB EMMC SSD</option>
              <option value="128GBe">128GB EMMC SSD</option>
              <option value="128GB">128GB SSD</option>
              <option value="256GB">256GB SSD</option>
              <option value="512GB">512GB SSD</option>
              <option value="1TB">1TB SSD</option>
              <option value="2TB">2TB SSD</option>
              <option value="4TB">4TB SSD</option>
            </select>
            {errors.ssd && <p className="text-red-500 text-sm mt-1">{errors.ssd}</p>}
          </div>
        </div>
        <button
          type="submit"
          className="w-full bg-blue-600 text-white p-3 rounded hover:bg-blue-700"
        >
          Submit
        </button>
      </form>
    </div>
  );
}

export default LaptopSales;