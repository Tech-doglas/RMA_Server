import Toast from './Toast';
import { canPermission } from './access';
import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import MultiSelect from "./MultiSelect";
import { getOptionClass } from "./styles";
import copy from "copy-to-clipboard";
import { useListState } from './listNavigation';

function GenericList({
  items,
  columns,
  searchFields,
  filterFields,
  basePath,
  itemKey,
  onSearch,
  Xie = false,
  actions,
  loading = false,
  error = ''
}) {
  const [search, setSearch] = useListState('filters',
    Object.fromEntries([
      ...searchFields.map((f) => [f.name, ""]),
      ...filterFields.map((f) => [f.name, f.type === 'select' ? '' : []]),
    ])
  );
  const [visibleColumns, setVisibleColumns] = useState(() => {
    // Initialize visibleColumns from localStorage or use default values
    const savedColumns = {};
    columns.forEach((col) => {
      let savedState;
      try { savedState = JSON.parse(localStorage.getItem(`${basePath}-${col.key}`)); } catch (_) { /* Use the default if browser storage is unavailable. */ }
      savedColumns[col.key] = typeof savedState === 'boolean' ? savedState : col.defaultVisible !== false;
    });
    return savedColumns;
  });
  const [showColumnFilter, setShowColumnFilter] = useState(false);
  const [toast, setToast] = useState({ message: "", visible: false }); // State for toast notification
  const navigate = useNavigate();

  const [sortConfig, setSortConfig] = useListState('sort', { key: null, direction: "asc" });
  const [page, setPage] = useListState('page', 1);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const permittedActions = (actions || []).filter(action => canPermission('nonpc.' + (action.name === 'Details Check' ? 'request' : 'ready')));

  const [selectedRows, setSelectedRows] = useState([]);

  const [showActionMenu, setShowActionMenu] = useState(false);
  useEffect(() => {
    const ids = new Set(items.map(item => item[itemKey]));
    setSelectedRows(rows => rows.filter(id => ids.has(id)));
  }, [items, itemKey]);

  const handleSelectRow = (itemKeyVal) => {
    setSelectedRows((prev) =>
      prev.includes(itemKeyVal)
        ? prev.filter((key) => key !== itemKeyVal)
        : [...prev, itemKeyVal]
    );
  };

  const handleSelectAll = () => {
    const pageIds = pageItems.map(item => item[itemKey]);
    if (pageIds.every(id => selectedRows.includes(id))) {
      setSelectedRows(rows => rows.filter(id => !pageIds.includes(id)));
    } else {
      setSelectedRows(rows => [...new Set([...rows, ...pageIds])]);
    }
  };

  const handleAction = async (action) => {
    if (actionBusy || loading) return;
    setActionBusy(true);
    setActionError('');
    try {
      await action(selectedRows);
      setShowActionMenu(false);
      setSelectedRows([]);
      setToast({ message: 'Selected items updated.', visible: true });
    } catch (error) { setActionError(error.message || 'Unable to update selected items. Please try again.'); }
    finally { setActionBusy(false); }
  };

  const handleSearchChange = (e) => {
    setPage(1);
    setSelectedRows([]);
    const { name, value, type, checked } = e.target;
    if (type === "checkbox") {
      setSearch((prev) => ({
        ...prev,
        [name]: checked
          ? [...prev[name], value]
          : prev[name].filter((v) => v !== value),
      }));
    } else if (type === "select-multiple") {
      const selectedOptions = Array.from(e.target.selectedOptions).map(
        (option) => option.value
      );
      setSearch((prev) => ({ ...prev, [name]: selectedOptions }));
    } else {
      setSearch((prev) => ({ ...prev, [name]: value }));
    }
  };

  let filteredItems = items.filter((item) => {
    return (
      searchFields.every((field) => {
        const value = search[field.name];
        if (!value) return true;
        return String(item[field.key] ?? '')
          .toLowerCase()
          .includes(value.toLowerCase());
      }) &&
      filterFields.every((field) => {
        const values = search[field.name];
        if (!values || values.length === 0) return true;
        const itemValue = field.getValue
          ? field.getValue(item)
          : item[field.key];
        return Array.isArray(values) ? values.includes(itemValue) : values === itemValue;
      })
    );
  });

  if (sortConfig.key) {
    const collator = new Intl.Collator(undefined, {
      numeric: true,
      sensitivity: "base",
    });

    filteredItems = [...filteredItems].sort((a, b) => {
      const aVal = a[sortConfig.key]?.toString().trim() ?? "";
      const bVal = b[sortConfig.key]?.toString().trim() ?? "";

      return sortConfig.direction === "asc"
        ? collator.compare(aVal, bVal)
        : collator.compare(bVal, aVal);
    });
  }

  const pageCount = Math.max(1, Math.ceil(filteredItems.length / 50));
  const currentPage = Math.max(1, Math.min(Number(page) || 1, pageCount));
  const pageItems = filteredItems.slice((currentPage - 1) * 50, currentPage * 50);
  const detailPath = item => `${basePath}/${encodeURIComponent(item[itemKey])}?from=${encodeURIComponent(window.location.pathname + window.location.search)}`;

  const toggleColumn = (column) => {
    setVisibleColumns((prev) => {
      const newVisibleColumns = { ...prev, [column]: !prev[column] };
      // Save to localStorage with a unique key per page and column
      try { localStorage.setItem(
        `${basePath}-${column}`,
        JSON.stringify(newVisibleColumns[column])
      ); } catch (_) { /* Keep the list usable without browser storage. */ }
      return newVisibleColumns;
    });
  };

  const handleCopy = (text, e) => {
    e.stopPropagation(); // Prevent the row click event from firing
    const copied = copy(String(text));
    setToast({ message: copied ? `Copied: ${text}` : 'Unable to copy. Select the text and copy it manually.', type: copied ? 'success' : 'error', visible: true });
  };

  const handleSort = (key) => {
    setSortConfig((prev) => {
      if (prev.key === key) {
        return { key, direction: prev.direction === "asc" ? "desc" : "asc" };
      } else {
        return { key, direction: "asc" };
      }
    });
  };

  const handleSearchClick = () => {
    setSelectedRows([]);
    onSearch(search);
    // setSearch(
    //   Object.fromEntries([
    //     ...searchFields.map((f) => [f.name, ""]),
    //     ...filterFields.map((f) => [f.name, []]),
    //   ])
    // );
  };

  const handleSearchResetClick = () => {
    const reset = Object.fromEntries([
        ...searchFields.map((f) => [f.name, ""]),
        ...filterFields.map((f) => [f.name, f.type === 'select' ? '' : []]),
      ]);
    setSearch(reset);
    setPage(1);
    setSelectedRows([]);
    onSearch(reset);
  };

  // Define which columns should be copyable
  const copyableColumns = [
    "SerialNumber",
    "OdooRef",
    "SKU",
    "OrderNumber",
    "TrackingNumber",
    "Model",
  ];

  return (
    <div className="app-page app-list">
      <div className="bg-gray-100">
        <h1 className="text-2xl font-bold mb-4">
          {basePath.charAt(1).toUpperCase() +
            basePath.slice(2).replace("-", " ")}{" "}
          List
        </h1>
        <div className="app-actions mb-4">
          {!Xie && canPermission((basePath === '/pc' ? 'pc' : 'nonpc') + '.create') && (
            <Link to={`${basePath}/input`} className="app-button">Input</Link>
          )}
          <button
            onClick={() => navigate('/dashboard')}
            className="bg-orange-500 text-white px-4 py-2 rounded hover:bg-orange-600"
          >
            Home
          </button>
          {permittedActions.length > 0 && selectedRows.length > 0 && (
            <div className="relative">
              <button
                className="bg-green-600 text-white font-bold px-4 py-2 rounded hover:bg-green-700 flex items-center"
                onClick={() => setShowActionMenu(v => !v)}
                disabled={actionBusy || loading}
                aria-expanded={showActionMenu}
              >
                {actionBusy ? 'Updating…' : `Actions (${selectedRows.length} selected)`} <span className="ml-1">▼</span>
              </button>
              {showActionMenu && (
                <div className="absolute left-0 mt-2 w-40 bg-white border rounded shadow z-50">
                  {
                    permittedActions.map(action => (
                      <button
                        key={action?.name}
                        className="w-full text-left px-4 py-2 hover:bg-gray-100"
                        onClick={() => handleAction(action.action)}
                        disabled={actionBusy || loading}
                      >
                        {action.name}
                      </button>
                    ))}
                </div>
              )}
            </div>
          )}
        </div>

        <form onSubmit={event => { event.preventDefault(); handleSearchClick(); }} className="bg-white p-4 rounded-lg shadow mb-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            {searchFields.map((field) => (
              <div key={field.name}>
                <label htmlFor={`search-${field.name}`} className="block text-gray-700 font-bold mb-2">
                  {field.label}
                </label>
                {field.type === "text" ? (
                  <input
                    type="text"
                    id={`search-${field.name}`}
                    name={field.name}
                    value={search[field.name]}
                    onChange={handleSearchChange}
                    className="w-full p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-600"
                    placeholder={field.placeholder}
                  />
                ) : field.type === "date" ? (
                  <input
                    type="date"
                    id={`search-${field.name}`}
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
                  <label htmlFor={`filter-${field.name}`} className="block text-gray-700 font-bold mb-2">
                    {field.label}
                  </label>

                  {field.type === "select" ? (
                    <select
                      id={`filter-${field.name}`}
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
                  ) : field.type === "checkbox" ? (
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
                  ) : field.type === "multiselect" ? (
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
                onClick={handleSearchResetClick}
                className="bg-red-600 hover:bg-red-700 m-2 text-white font-semibold px-6 py-2 rounded shadow"
              >
                Reset
              </button>
              <button
                type="submit"
                disabled={loading}
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-2 rounded shadow"
              >
                {loading ? 'Searching…' : 'Search'}
              </button>
            </div>
          </div>
        </form>

        <div className="flex justify-between items-center mb-4">
          <div className="flex space-x-4">
            <span>Total Count: {filteredItems.length}</span>
          </div>
          <div className="relative">
            <button
              onClick={() => setShowColumnFilter(!showColumnFilter)}
              aria-expanded={showColumnFilter}
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
      {(error || actionError) && <p role="alert" className="p-3 mb-4 rounded bg-red-100 text-red-800">{error || actionError} {error && <button type="button" onClick={handleSearchClick} disabled={loading} className="underline ml-2">Try again</button>}</p>}
      {loading && <p role="status" className="mb-4">Loading items…</p>}

      {filteredItems.length > 0 ? (
        <div className="overflow-x-auto" aria-busy={loading || actionBusy}>
          <table className="w-full border-collapse bg-white shadow rounded">
            <thead>
              <tr className="bg-gray-200 sticky z-40">
                {permittedActions.length > 0 && (
                  <th className="p-2 border">
                    <input
                      type="checkbox"
                      checked={
                        pageItems.length > 0 && pageItems.every(item => selectedRows.includes(item[itemKey]))
                      }
                      onChange={handleSelectAll}
                      aria-label="Select all items on this page"
                      disabled={loading || actionBusy}
                    />
                  </th>
                )}
                <th scope="col" className="p-2 border">Details</th>
                {columns.map(
                  (col) =>
                    visibleColumns[col.key] && (
                      <th
                        key={col.key}
                        className="p-2 border cursor-pointer hover:bg-blue-100"
                        scope="col"
                        aria-sort={sortConfig.key === col.key ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                      >
                        <button type="button" className="text-left" onClick={() => handleSort(col.key)}>
                        {col.label}
                        {sortConfig.key === col.key && (
                          <span>
                            {sortConfig.direction === "asc" ? " ▲" : " ▼"}
                          </span>
                        )}
                        </button>
                      </th>
                    )
                )}
              </tr>
            </thead>
            <tbody>
              {pageItems.map((item) => (
                <tr
                  key={item[itemKey]}
                  onClick={() => navigate(detailPath(item))}
                  className={`cursor-pointer hover:bg-gray-100 ${(item.Stock === "SOLD" && !item.TechDone)  || (!item.Stock && item.OrderNumber && !item.OrderDistributed)
                    ? "bg-red-100"
                    : (item.Stock === "SOLD" && item.TechDone) || (!item.Stock && item.OrderNumber && item.OrderDistributed)
                      ? "bg-gray-300"
                      : ""
                    }`}
                >
                  {permittedActions.length > 0 && (
                    <td
                      className="p-2 border"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={selectedRows.includes(item[itemKey])}
                        onChange={() => handleSelectRow(item[itemKey])}
                        aria-label={`Select item ${item[itemKey]}`}
                        disabled={loading || actionBusy}
                      />
                    </td>
                  )}
                  <td className="p-2 border" onClick={event => event.stopPropagation()}><Link to={detailPath(item)} aria-label={`View item ${item[itemKey]}`} className="inline-flex py-3">View</Link></td>
                  {columns.map(
                    (col) =>
                      visibleColumns[col.key] && (
                        <td
                          key={col.key}
                          className={`p-2 border ${copyableColumns.includes(col.key)
                            ? "cursor-pointer hover:bg-gray-200"
                            : ""
                            } ${col.key === "Condition"
                              ? getOptionClass(
                                col.render
                                  ? col.render(item)
                                  : item[col.key] ?? "Unknown",
                                "conditions"
                              )
                              : col.key === "InspectionRequest"
                                ? getOptionClass(
                                  col.render ? col.render(item) : item[col.key],
                                  "inspectionRequest"
                                )
                                : col.key === "CreationDateTime"
                                  ? getOptionClass(
                                    (() => {
                                      const date = new Date(item[col.key]);
                                      const today = new Date();
                                      const diffDays = Math.floor(
                                        (today - date) / (1000 * 60 * 60 * 24)
                                      );
                                      return diffDays;
                                    })(),
                                    "dateAge"
                                  )
                                  : ""
                            }`}
                          onClick={(e) => {
                            if (copyableColumns.includes(col.key)) {
                              const text = col.render
                                ? col.render(item)
                                : item[col.key] || "";
                              handleCopy(text, e);
                            }
                          }}
                        >
                          {col.render ? col.render(item) : item[col.key]}
                        </td>
                      )
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        !loading && !error && <p className="text-gray-500">{items.length ? 'No items match these filters. Clear filters to see more results.' : 'No items found.'}</p>
      )}
      {filteredItems.length > 0 && <nav aria-label="List pages" className="app-actions mt-4">
        <button type="button" className="app-button secondary" disabled={currentPage === 1 || loading} onClick={() => setPage(currentPage - 1)}>Previous</button>
        <span role="status">Page {currentPage} of {pageCount} · {filteredItems.length} items</span>
        <button type="button" className="app-button secondary" disabled={currentPage === pageCount || loading} onClick={() => setPage(currentPage + 1)}>Next</button>
      </nav>}

      {/* Toast notification component */}
      <Toast message={toast.visible ? toast.message : ""} type={toast.type || "success"} onClose={() => setToast({ message: "", visible: false })} />
    </div>
  );
}

export default GenericList;
