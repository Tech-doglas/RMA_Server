import { canPermission, API_SERVER } from './access';
import React from 'react';
import { ClipLoader } from 'react-spinners';
import { BackToListing } from './listNavigation';

function DetailView({ item, fields, basePath, itemId, actions = [], images = [] }) {
  const scope = basePath.startsWith('/non-pc') ? 'nonpc' : basePath.startsWith('/pc') ? 'pc' : basePath.startsWith('/xie') ? 'xie' : 'legacy';
  const actionPermission = action => action.permission || scope + ({ Sales: '.sell', Edit: '.edit', 'Edit Record': '.edit', Done: '.inspect', Distributed: '.distribute' }[action.label] || '.view');

  if (!item) {
    return (
      <div role="status" className="p-6 flex gap-3 justify-center items-center">
        <ClipLoader color="#4B5563" size={40} aria-hidden="true" />
        Loading record…
      </div>
    );
  }

  return (
    <div className="app-page">
      <h1 className="text-2xl font-bold mb-4">{basePath.charAt(1).toUpperCase() + basePath.slice(2).replace('-', ' ')} Details</h1>
      <div className="app-actions mb-4">
        <BackToListing fallback={basePath} />
        {actions.filter(action => !action.hidden && canPermission(actionPermission(action))).map((action, index) =>
          action.render ? (
            <React.Fragment key={action.label || index}>{action.render()}</React.Fragment>
          ) : (
            <button
              key={index}
              onClick={action.onClick}
              className={`px-4 py-2 rounded text-white ${action.className}`}
              disabled={action.disabled}
              hidden={action.hidden}
            >
              {action.label}
            </button>
          )
        )}
      </div>

      <div className="app-card">
        <table className="w-full border-collapse">
          <tbody>
            {fields.map((field) => (
              <tr key={field.key} className="border-b">
                <th scope="row" className="p-2 text-left">{field.label}</th>
                <td className={`p-2 ${field.className ? field.className(item) : ''}`}>
                  {field.render ? field.render(item) : item[field.key] ?? 'None'}
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
                  src={`${API_SERVER}/images/${encodeURIComponent(images.type)}/${encodeURIComponent(itemId)}/${encodeURIComponent(filename)}`}
                  alt={filename}
                  className="w-[600px] h-auto rounded shadow"
                  loading="lazy"
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
