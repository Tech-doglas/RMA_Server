import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

function GenericForm({ initialData, fields, onSubmit, basePath, itemId, isEdit = false, hideBackButton = false }) {
  const [formData, setFormData] = useState(initialData);
  const [errors, setErrors] = useState({});
  const navigate = useNavigate();

  const handleChange = (e) => {
    const { name, value, type, checked, files } = e.target;
    if (type === 'checkbox') {
      setFormData((prev) => ({ ...prev, [name]: checked }));
    } else if (type === 'file') {
      setFormData((prev) => ({ ...prev, [name]: files }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
  };

  const validateForm = () => {
    const newErrors = {};
    fields.forEach((field) => {
      if (field.required && !formData[field.name]) {
        newErrors[field.name] = `${field.label} is required`;
      }
      if (field.validate) {
        const error = field.validate(formData[field.name], formData);
        if (error) newErrors[field.name] = error;
      }
    });
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (validateForm()) {
      onSubmit(formData);
      navigate(basePath);
    }
  };

  const handleDelete = () => {
    if (window.confirm('Are you sure you want to delete this item?')) {
      // Simulate delete (in a real app, this would be an API call)
      console.log('Deleted Item:', itemId);
      navigate(basePath);
    }
  };

  return (
    <div className="w-full bg-white rounded-lg shadow p-6 max-w-xl mx-auto mt-4">
      <div className="bg-white p-6 rounded-lg shadow-lg w-full max-w-2xl">
        <h1 className="text-2xl font-bold mb-4 text-center">
          {isEdit ? 'Edit' : 'Input New'} {basePath.charAt(1).toUpperCase() + basePath.slice(2).replace('-', ' ')} Item
        </h1>
        {!hideBackButton && (
          <button
            onClick={() => navigate(basePath)}
            className="mb-4 bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
          >
            Back
          </button>
        )}
        <form onSubmit={handleSubmit}>
          {fields.map((field) => (
            <div key={field.name} className="mb-4">
              <label className="block text-gray-700 font-bold mb-2">{field.label}</label>
              {field.type === 'text' || field.type === 'date' || field.type === 'number' ? (
                <input
                  type={field.type}
                  id={field.name}
                  name={field.name}
                  value={formData[field.name] || ''}
                  onChange={handleChange}
                  className="w-full p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-600"
                  placeholder={field.placeholder}
                />
              ) : field.type === 'select' ? (
                <select
                  id={field.name}
                  name={field.name}
                  value={formData[field.name] || ''}
                  onChange={handleChange}
                  className="w-full p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  {field.options.map((option) => (
                    <option key={option.value} value={option.value} disabled={option.disabled}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : field.type === 'checkbox' ? (
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id={field.name}
                    name={field.name}
                    checked={formData[field.name] || false}
                    onChange={handleChange}
                    className="h-5 w-5"
                  />
                </div>
              ) : field.type === 'textarea' ? (
                <textarea
                  id={field.name}
                  name={field.name}
                  value={formData[field.name] || ''}
                  onChange={handleChange}
                  className="w-full p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-600 h-24"
                  placeholder={field.placeholder}
                  rows="5"
                />
              ) : field.type === 'file' ? (
                <>
                  {isEdit && (
                    <div className="mb-2">
                      <label className="block text-gray-700 font-bold mb-2">Current Images</label>
                      <p className="text-gray-500">No images available</p>
                    </div>
                  )}
                  <input
                    type="file"
                    id={field.name}
                    name={field.name}
                    multiple={field.multiple}
                    accept={field.accept}
                    onChange={handleChange}
                    className="w-full p-2 border rounded"
                  />
                  <div className="mt-2 flex flex-wrap gap-2">
                    {formData[field.name] && formData[field.name].length > 0 &&
                      Array.from(formData[field.name]).map((file, index) => (
                        <img
                          key={index}
                          src={URL.createObjectURL(file)}
                          alt="Preview"
                          className="w-24 h-24 object-cover rounded"
                        />
                      ))}
                  </div>
                </>
              ) : null}
              {errors[field.name] && (
                <p className="text-red-500 text-sm mt-1">{errors[field.name]}</p>
              )}
            </div>
          ))}
          <div className="flex space-x-2">
            <button
              type="submit"
              className="w-full sm:w-auto bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
            >
              {isEdit ? 'Save Changes' : 'Submit'}
            </button>
            {isEdit && (
              <>
                <button
                  type="button"
                  onClick={() => navigate(`${basePath}/${itemId}`)}
                  className="w-full sm:w-auto bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  className="w-full sm:w-auto bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
                >
                  Delete Item
                </button>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

export default GenericForm;