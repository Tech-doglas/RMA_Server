import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipLoader } from 'react-spinners';

function DetailView({ item, fields, basePath, itemId, actions = [], images = [] }) {
  const navigate = useNavigate();

  if (!item) {
    return (
      <div className="p-6 flex justify-center items-center">
        <ClipLoader color="#4B5563" size={40} />
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">{basePath.charAt(1).toUpperCase() + basePath.slice(2).replace('-', ' ')} Details</h1>
      <div className="flex space-x-2 mb-4">
        <button
          onClick={() => navigate(basePath)}
          className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
        >
          Back
        </button>
        {actions.map((action, index) =>
          action.render ? (
            action.render()
          ) : (
            <button
              key={index}
              onClick={action.onClick}
              className={`px-4 py-2 rounded text-white ${action.className}`}
              disabled={action.disabled}
            >
              {action.label}
            </button>
          )
        )}
      </div>

      <div className="bg-white p-4 rounded-lg shadow">
        <table className="w-full border-collapse">
          <tbody>
            {fields.map((field) => (
              <tr key={field.key} className="border-b">
                <th className="p-2 text-left">{field.label}</th>
                <td className={`p-2 ${field.className ? field.className(item) : ''}`}>
                  {field.render ? field.render(item) : item[field.key] || 'None'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6">
        <h2 className="text-xl font-bold mb-2">Images</h2>
        {images.list && images.list.length > 0 ? (
          <div className="flex flex-wrap gap-4">
            {images.list.map((filename) => (
              <div key={filename} className="relative">
                <img
                  src={`http://127.0.0.1:8088/images/${images.type}/${itemId}/${filename}`}
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
  );
}

export default DetailView;