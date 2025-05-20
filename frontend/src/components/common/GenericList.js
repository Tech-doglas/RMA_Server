import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import MultiSelect from './MultiSelect';
import { getOptionClass } from './styles';
import copy from 'copy-to-clipboard';

function GenericList({ items, columns, searchFields, filterFields, basePath, itemKey, onSearch  }) {
  const [search, setSearch] = useState(
    Object.fromEntries([...searchFields.map((f) => [f.name, '']), ...filterFields.map((f) => [f.name, []])])
  );
  const [visibleColumns, setVisibleColumns] = useState(() => {
    // Initialize visibleColumns from localStorage or use default values
    const savedColumns = {};
    columns.forEach((col) => {
      const savedState = localStorage.getItem(`${basePath}-${col.key}`);
      savedColumns[col.key] = savedState !== null ? JSON.parse(savedState) : col.defaultVisible !== false;
    });
    return savedColumns;
  });
  const [showColumnFilter, setShowColumnFilter] = useState(false);
  const [toast, setToast] = useState({ message: '', visible: false }); // State for toast notification
  const navigate = useNavigate();

  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });

  const handleSearchChange = (e) => {
    const { name, value, type, checked } = e.target;
    if (type === 'checkbox') {
      setSearch((prev) => ({
        ...prev,
        [name]: checked ? [...prev[name], value] : prev[name].filter((v) => v !== value),
      }));
    } else if (type === 'select-multiple') {
      const selectedOptions = Array.from(e.target.selectedOptions).map((option) => option.value);
      setSearch((prev) => ({ ...prev, [name]: selectedOptions }));
    } else {
      setSearch((prev) => ({ ...prev, [name]: value }));
    }
  };

  let filteredItems = items.filter((item) => {
    return searchFields.every((field) => {
      const value = search[field.name];
      if (!value) return true;
      return String(item[field.key]).toLowerCase().includes(value.toLowerCase());
    }) && filterFields.every((field) => {
      const values = search[field.name];
      if (values.length === 0) return true;
      const itemValue = field.getValue ? field.getValue(item) : item[field.key];
      return values.includes(itemValue);
    });
  });
  
  if (sortConfig.key) {
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  
    filteredItems = [...filteredItems].sort((a, b) => {
      const aVal = a[sortConfig.key]?.toString().trim() ?? '';
      const bVal = b[sortConfig.key]?.toString().trim() ?? '';
  
      return sortConfig.direction === 'asc'
        ? collator.compare(aVal, bVal)
        : collator.compare(bVal, aVal);
    });
  }

  const toggleColumn = (column) => {
    setVisibleColumns((prev) => {
      const newVisibleColumns = { ...prev, [column]: !prev[column] };
      // Save to localStorage with a unique key per page and column
      localStorage.setItem(`${basePath}-${column}`, JSON.stringify(newVisibleColumns[column]));
      return newVisibleColumns;
    });
  };

  const handleCopy = (text, e) => {
    e.stopPropagation(); // Prevent the row click event from firing
    copy(text)
    setToast({ message: `Copied: ${text}`, visible: true });
    setTimeout(() => setToast({ message: '', visible: false }), 2000);
  };

  const handleSort = (key) => {
    setSortConfig((prev) => {
      if (prev.key === key) {
        return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      } else {
        return { key, direction: 'asc' };
      }
    });
  };

  // Define which columns should be copyable
  const copyableColumns = ['SerialNumber', 'OdooRef', 'SKU', 'OrderNumber', 'TrackingNumber', 'Model'];

  return (
    <div className="p-6">
      <div className="sticky top-0 z-50 bg-gray-100">
        <h1 className="text-2xl font-bold mb-4">{basePath.charAt(1).toUpperCase() + basePath.slice(2).replace('-', ' ')} List</h1>
        <div className="flex space-x-2 mb-4">
          <Link to={`${basePath}/input`}>
            <button className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">
              Input
            </button>
          </Link>
          <button
            onClick={() => navigate('/dashboard')}
            className="bg-orange-500 text-white px-4 py-2 rounded hover:bg-orange-600"
          >
            Home
          </button>
        </div>

        <div className="bg-white p-4 rounded-lg shadow mb-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            {searchFields.map((field) => (
              <div key={field.name}>
                <label className="block text-gray-700 font-bold mb-2">{field.label}</label>
                {field.type === 'text' ? (
                  <input
                    type="text"
                    name={field.name}
                    value={search[field.name]}
                    onChange={handleSearchChange}
                    className="w-full p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-600"
                    placeholder={field.placeholder}
                  />
                ) : field.type === 'date' ? (
                  <input
                    type="date"
                    name={field.name}
                    value={search[field.name]}
                    onChange={handleSearchChange}
                    className="w-full p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                ) : null}
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-4 items-center justify-between">
            <div className="flex flex-wrap gap-4">
              {filterFields.map((field) => (
                <div key={field.name}>
                  <label className="block text-gray-700 font-bold mb-2">{field.label}</label>

                  {field.type === 'select' ? (
                    <select
                      name={field.name}
                      value={search[field.name]}
                      onChange={handleSearchChange}
                      className="w-full p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-600"
                    >
                      {field.options.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  ) : field.type === 'checkbox' ? (
                    <div className="flex flex-wrap gap-2">
                      {field.options.map((option) => (
                        <label key={option.value} className="flex items-center">
                          <input
                            type="checkbox"
                            name={field.name}
                            value={option.value}
                            checked={search[field.name].includes(option.value)}
                            onChange={handleSearchChange}
                            className="mr-1"
                          />
                          {option.label}
                        </label>
                      ))}
                    </div>
                  ) : field.type === 'multiselect' ? (
                    <MultiSelect
                      name={field.name}
                      options={field.options}
                      value={search[field.name]}
                      onChange={handleSearchChange}
                      label={field.label}
                    />
                  ) : null}
                </div>
              ))}
            </div>
            <div className="flex items-center h-full">
              <button
                type="button"
                onClick={() => onSearch(search)}
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-2 rounded shadow"
              >
                🔍 Search
              </button>
            </div>
          </div>
        </div>

        <div className="flex justify-between items-center mb-4">
          <span>Total Count: {filteredItems.length}</span>
          <div className="relative">
            <button
              onClick={() => setShowColumnFilter(!showColumnFilter)}
              className="bg-gray-200 px-4 py-2 rounded"
            >
              Filter Columns ▼
            </button>
            {showColumnFilter && (
              <div className="absolute right-0 mt-2 bg-white p-4 rounded shadow-lg z-10 min-w-[200px] max-w-[250px]">
                {columns.map((col) => (
                  <label key={col.key} className="block">
                    <input
                      type="checkbox"
                      checked={visibleColumns[col.key]}
                      onChange={() => toggleColumn(col.key)}
                      className="mr-2"
                    />
                    {col.label}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {filteredItems.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse bg-white shadow rounded">
            <thead>
              <tr className="bg-gray-200 sticky z-40">
                {columns.map((col) => visibleColumns[col.key] && (
                  <th
                  key={col.key}
                  className="p-2 border cursor-pointer hover:bg-blue-100"
                  onClick={() => handleSort(col.key)}
                >
                  {col.label}
                  {sortConfig.key === col.key && (
                    <span>{sortConfig.direction === 'asc' ? ' ▲' : ' ▼'}</span>
                  )}
                </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) => (
                <tr
                  key={item[itemKey]}
                  onClick={() => window.open(`http://10.147.20.223:3000${basePath}/${item[itemKey]}`, '_blank')}
                  className={`cursor-pointer hover:bg-gray-100 ${
                    item.Stock === 'SOLD' && !item.TechDone ? 'bg-red-100' :
                    item.Stock === 'SOLD' && item.TechDone ? 'bg-gray-300' : ''
                  }`}
                >
                  {columns.map((col) => visibleColumns[col.key] && (
                    <td
                      key={col.key}
                      className={`p-2 border ${
                        copyableColumns.includes(col.key) ? 'cursor-pointer hover:bg-gray-200' : ''
                      } ${
                        col.key === 'Condition' ? getOptionClass(
                          col.render ? col.render(item) : (item[col.key] ?? 'Unknown'),
                          'conditions'
                        ) : col.key === 'InspectionRequest' ? getOptionClass(
                          col.render ? col.render(item) : item[col.key],
                          'inspectionRequest'
                        ) : ''
                      }`}
                      onClick={(e) => {
                        if (copyableColumns.includes(col.key)) {
                          const text = col.render ? col.render(item) : item[col.key] || '';
                          handleCopy(text, e);
                        }
                      }}
                    >
                      {col.render ? col.render(item) : item[col.key]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-gray-500">No items in inventory.</p>
      )}

      {/* Toast notification component */}
      {toast.visible && (
        <div className="fixed bottom-4 right-4 bg-gray-800 text-white px-4 py-2 rounded shadow-lg z-50">
          {toast.message}
        </div>
      )}
    </div>
  );
}

export default GenericList;