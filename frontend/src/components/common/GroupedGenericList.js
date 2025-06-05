import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import MultiSelect from './MultiSelect';
import { getOptionClass } from '../common/styles';
import copy from 'copy-to-clipboard';

function GroupedGenericList({ items, columns, searchFields, filterFields, basePath, itemKey, onSearch }) {
  const [search, setSearch] = useState(
    Object.fromEntries([...searchFields.map((f) => [f.name, '']), ...filterFields.map((f) => [f.name, []])])
  );
  const [expandedGroups, setExpandedGroups] = useState({});
  const [visibleColumns, setVisibleColumns] = useState(() => {
    const savedColumns = {};
    columns.forEach((col) => {
      const savedState = localStorage.getItem(`${basePath}-${col.key}`);
      savedColumns[col.key] = savedState !== null ? JSON.parse(savedState) : col.defaultVisible !== false;
    });
    return savedColumns;
  });
  const [showColumnFilter, setShowColumnFilter] = useState(false);
  const [toast, setToast] = useState({ message: '', visible: false });
  const navigate = useNavigate();

  const mapCondition = (code) => {
    switch (code) {
      case 'N':
        return 'New';
      case 'A':
        return 'Grade A';
      case 'B':
        return 'Grade B';
      case 'C':
        return 'Grade C';
      case 'F':
        return 'Grade F';
      case 'X':
        return 'No Grade';
      default:
        return code || '';
    }
  };

  const isCenterAlign = (colKey) => {
    return ['condition', 'return_type'].includes(colKey);
  };

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

  const groupedItems = filteredItems.reduce((acc, item) => {
    const groupKey = item.tracking_number;
    if (!acc[groupKey]) acc[groupKey] = [];
    acc[groupKey].push(item);
    return acc;
  }, {});

  const toggleGroup = (trackingNumber) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [trackingNumber]: !prev[trackingNumber],
    }));
  };

  const toggleColumn = (column) => {
    setVisibleColumns((prev) => {
      const newVisibleColumns = { ...prev, [column]: !prev[column] };
      localStorage.setItem(`${basePath}-${column}`, JSON.stringify(newVisibleColumns[column]));
      return newVisibleColumns;
    });
  };

  const handleCopy = (text, e) => {
    e.stopPropagation();
    copy(text);
    setToast({ message: `Copied: ${text}`, visible: true });
    setTimeout(() => setToast({ message: '', visible: false }), 2000);
  };

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

  const copyableColumns = ['SerialNumber', 'OdooRef', 'SKU', 'OrderNumber', 'TrackingNumber'];

  return (
    <div className="p-6">
      {/* Top Header Section */}
      <div className="sticky top-0 z-50 bg-gray-100">
        <h1 className="text-2xl font-bold mb-4">SnowBell Return List</h1>
        <div className="flex space-x-2 mb-4">
          <Link to={`/xie/input`}>
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
          <button
            className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
          >
            Request
          </button>
        </div>

        {/* Search and Filter Section */}
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
                  {field.type === 'multiselect' && (
                    <MultiSelect
                      name={field.name}
                      options={field.options}
                      value={search[field.name]}
                      onChange={handleSearchChange}
                      label={field.label}
                    />
                  )}
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

        {/* Filter Columns */}
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

      {/* Table Section */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse bg-white shadow rounded">
          <thead>
            <tr className="bg-gray-200 sticky top-0 z-40">
              <th className="p-2 border"></th>
              {columns.map((col) => visibleColumns[col.key] && (
                <th key={col.key} className={`p-2 border bg-gray-100 ${isCenterAlign(col.key) ? 'text-center' : ''}`}>
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.entries(groupedItems).map(([trackingNumber, groupItems]) => {
              let chilList = groupItems.slice(1);
              const isExpandable = groupItems.length > 1;
              return (
                <React.Fragment key={trackingNumber}>
                  <tr className="bg-gray-100 cursor-pointer" onClick={() =>
                      window.open(`http://${window.location.hostname}:${window.location.port}${basePath}/${trackingNumber}`, '_blank')
                  }>
                    <td className="p-2 border text-center">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleGroup(trackingNumber);
                        }}
                        className="text-lg font-bold"
                      >
                        {isExpandable && (expandedGroups[trackingNumber] ? '➖' : '➕')}
                      </button>
                    </td>
                    {columns.map((col) => visibleColumns[col.key] && (
                      <td
                        key={col.key}
                        className={`p-2 border font-bold ${isCenterAlign(col.key) ? 'text-center' : ''} ${col.key === 'return_type' ? getOptionClass(groupItems[0][col.key], 'return_type') : ''}`}
                      >
                        {col.key === 'condition'
                        ? mapCondition(groupItems[0][col.key])
                        : ['inspection_date', 'tracking_received_date', 'delivery_date'].includes(col.key)
                          ? formatDate(groupItems[0][col.key])
                          : groupItems[0][col.key]}
                      </td>
                    ))}
                  </tr>
                  {expandedGroups[trackingNumber] && chilList.map((item) => (
                    <tr
                      key={item[itemKey]}
                      onClick={() => window.open(`http://${window.location.hostname}:${window.location.port}${basePath}/${trackingNumber}`, '_blank')}
                      className="hover:bg-gray-100 cursor-pointer"
                    >
                      <td className="p-2 border"></td>
                      {columns.map((col) => visibleColumns[col.key] && (
                        <td
                          key={col.key}
                          className={`p-2 border ${copyableColumns.includes(col.key) ? 'cursor-pointer hover:bg-gray-200' : ''} ${isCenterAlign(col.key) ? 'text-center' : ''} ${col.key === 'return_type' ? getOptionClass(item[col.key], 'return_type') : ''}`}
                          onClick={(e) => {
                            if (copyableColumns.includes(col.key)) {
                              const text = item[col.key] || '';
                              handleCopy(text, e);
                            }
                          }}
                        >
                          {col.key === 'tracking_number'
                            ? '\u00A0'
                            : col.key === 'condition'
                              ? mapCondition(item[col.key])
                              : ['inspection_date', 'tracking_received_date', 'delivery_date'].includes(col.key)
                                ? formatDate(item[col.key])
                                : item[col.key]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </React.Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Toast Notification */}
      {toast.visible && (
        <div className="fixed bottom-4 right-4 bg-gray-800 text-white px-4 py-2 rounded shadow-lg z-50">
          {toast.message}
        </div>
      )}
    </div>
  );
}

export default GroupedGenericList;
