import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ClipLoader } from "react-spinners";
import copy from "copy-to-clipboard";

const API = `http://${window.location.hostname}:8088`;
const PAGE_SIZE = 20;

function formatTimestamp(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  if (isNaN(d.getTime())) return String(ts);
  return d.toLocaleString();
}

function unitStatus(item) {
  if (item.shipDate) return "Shipped";
  if (item.inspectionDate) return "Inspected";
  return "Pending";
}

function itemHaystack(item) {
  let statusWords;
  if (item.shipDate) statusWords = " done inspected shipped ";
  else if (item.inspectionDate) statusWords = " done inspected ";
  else statusWords = " pending ";
  return (
    " " + [item.id, item.fileNo, item.tracking, item.laptop, item.serials,
      item.pallet, item.bulkType, item.receivedDate, item.inspectionDate,
      item.shipDate, item.shipBatch].map((v) => v || "").join(" ") +
    statusWords
  ).toLowerCase();
}

// Collapse rows into tracking-number groups, preserving newest-first order.
function groupByTracking(items) {
  const groups = [];
  const byTracking = {};
  items.forEach((it) => {
    const key = (it.tracking || "").trim();
    if (!key) {
      groups.push({ tracking: "", units: [it] });
      return;
    }
    if (byTracking[key]) byTracking[key].units.push(it);
    else {
      const g = { tracking: key, units: [it] };
      byTracking[key] = g;
      groups.push(g);
    }
  });
  return groups;
}

const COLUMNS = [
  { key: "fileNo", label: "File No" },
  { key: "tracking", label: "Tracking #" },
  { key: "laptop", label: "Laptop Name" },
  { key: "serials", label: "Serial #" },
  { key: "receivedDate", label: "Received Date" },
  { key: "pallet", label: "Pallet" },
  { key: "bulkType", label: "Bulk Type" },
  { key: "status", label: "Status" },
  { key: "timestamp", label: "Submitted" },
];

const STATUS_CLASS = {
  Pending: "bg-yellow-100 text-yellow-800",
  Inspected: "bg-green-100 text-green-800",
  Shipped: "bg-purple-100 text-purple-800",
};

function StatusBadge({ status }) {
  return (
    <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded ${STATUS_CLASS[status]}`}>
      {status}
    </span>
  );
}

function ReturnsList() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [palletFilter, setPalletFilter] = useState("");
  const [bulkFilter, setBulkFilter] = useState("");
  const [combine, setCombine] = useState(true);
  const [page, setPage] = useState(1);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: "asc" });
  const [expandedGroups, setExpandedGroups] = useState({});
  const [toast, setToast] = useState({ message: "", visible: false });
  const [visibleColumns, setVisibleColumns] = useState(() => {
    const saved = {};
    COLUMNS.forEach((col) => {
      const savedState = localStorage.getItem(`/returns-${col.key}`);
      saved[col.key] = savedState !== null ? JSON.parse(savedState) : true;
    });
    return saved;
  });
  const [showColumnFilter, setShowColumnFilter] = useState(false);

  const loadData = () => {
    setLoading(true);
    setError("");
    fetch(`${API}/returns/list`)
      .then((res) => res.json())
      .then((data) => {
        if (data.status === "success") {
          setItems(
            (data.items || []).map((it) => ({ ...it, _hay: itemHaystack(it) }))
          );
        } else {
          setError(data.message || "Load failed");
        }
        setLoading(false);
      })
      .catch((err) => {
        setError(String(err));
        setLoading(false);
      });
  };

  useEffect(loadData, []);

  const pallets = useMemo(() => {
    const set = new Set();
    items.forEach((it) => {
      const p = (it.pallet || "").trim();
      if (p) set.add(p);
    });
    return Array.from(set).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true })
    );
  }, [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (statusFilter === "pending" && item.inspectionDate) return false;
      if (statusFilter === "done" && (!item.inspectionDate || item.shipDate)) return false;
      if (statusFilter === "shipped" && !item.shipDate) return false;
      if (palletFilter && item.pallet !== palletFilter) return false;
      if (bulkFilter) {
        const b = (item.bulkType || "").trim();
        if (bulkFilter === "__none__") {
          if (b) return false;
        } else if (b !== bulkFilter) return false;
      }
      if (q && item._hay.indexOf(q) === -1) return false;
      return true;
    });
  }, [items, search, statusFilter, palletFilter, bulkFilter]);

  const sorted = useMemo(() => {
    if (!sortConfig.key) return filtered;
    const collator = new Intl.Collator(undefined, {
      numeric: true,
      sensitivity: "base",
    });
    const value = (item) =>
      (sortConfig.key === "status" ? unitStatus(item) : item[sortConfig.key])
        ?.toString()
        .trim() ?? "";
    return [...filtered].sort((a, b) =>
      sortConfig.direction === "asc"
        ? collator.compare(value(a), value(b))
        : collator.compare(value(b), value(a))
    );
  }, [filtered, sortConfig]);

  const groups = useMemo(
    () => (combine ? groupByTracking(sorted) : sorted.map((it) => ({ tracking: (it.tracking || "").trim(), units: [it] }))),
    [sorted, combine]
  );

  const totalPages = Math.max(1, Math.ceil(groups.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageGroups = groups.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  useEffect(() => setPage(1), [search, statusFilter, palletFilter, bulkFilter, combine, sortConfig]);

  const handleReset = () => {
    setSearch("");
    setStatusFilter("");
    setPalletFilter("");
    setBulkFilter("");
  };

  const toggleGroup = (key) => {
    setExpandedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSort = (key) => {
    setSortConfig((prev) => {
      if (prev.key === key) {
        return { key, direction: prev.direction === "asc" ? "desc" : "asc" };
      }
      return { key, direction: "asc" };
    });
  };

  const toggleColumn = (column) => {
    setVisibleColumns((prev) => {
      const next = { ...prev, [column]: !prev[column] };
      localStorage.setItem(`/returns-${column}`, JSON.stringify(next[column]));
      return next;
    });
  };

  const openDetail = (id) =>
    window.open(
      `http://${window.location.hostname}:${window.location.port}/returns/${encodeURIComponent(id)}`,
      "_blank"
    );

  const handleCopy = (text, e) => {
    e.stopPropagation();
    let copied = false;
    try {
      copied = copy(text);
    } catch {
      copied = false;
    }
    setToast({ message: copied ? `Copied: ${text}` : "Copy not available", visible: true });
    setTimeout(() => setToast({ message: "", visible: false }), 2000);
  };

  const copyableColumns = ["fileNo", "tracking", "serials"];

  const cellValue = (item, colKey) => {
    switch (colKey) {
      case "status":
        return <StatusBadge status={unitStatus(item)} />;
      case "timestamp":
        return formatTimestamp(item.timestamp);
      case "laptop":
        return (
          <span className="line-clamp-2 max-w-md" title={item.laptop}>
            {item.laptop}
          </span>
        );
      default:
        return item[colKey];
    }
  };

  const cellClass = (colKey) =>
    `p-2 border ${copyableColumns.includes(colKey) ? "cursor-pointer hover:bg-gray-200" : ""}`;

  const cellCopyHandler = (item, colKey) => (e) => {
    if (copyableColumns.includes(colKey) && item[colKey]) {
      handleCopy(item[colKey], e);
    }
  };

  const renderGroupRow = (g, groupKey) => {
    const first = g.units[0];
    const hiddenRowCount = g.units.length - 1;
    let pending = 0, inspected = 0, shipped = 0;
    g.units.forEach((u) => {
      if (u.shipDate) shipped++;
      else if (u.inspectionDate) inspected++;
      else pending++;
    });

    const isMulti = hiddenRowCount > 0;
    const isExpanded = isMulti && expandedGroups[groupKey];

    return (
      <React.Fragment key={groupKey}>
        <tr
          className={`cursor-pointer ${isMulti ? "bg-gray-100 font-bold" : "hover:bg-gray-100"}`}
          onClick={() => openDetail(first.id)}
        >
          <td className={`p-2 border text-center ${isExpanded ? "border-l-4 border-l-purple-400" : ""}`}>
            {isMulti && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleGroup(groupKey);
                }}
                title={isExpanded ? "Collapse group" : `Show ${hiddenRowCount} more unit${hiddenRowCount === 1 ? "" : "s"}`}
                className="text-lg font-bold whitespace-nowrap"
              >
                {isExpanded ? "➖" : `➕ ${hiddenRowCount}`}
              </button>
            )}
          </td>
          {COLUMNS.map(
            (col) =>
              visibleColumns[col.key] && (
                <td key={col.key} className={cellClass(col.key)} onClick={cellCopyHandler(first, col.key)}>
                  {col.key === "tracking" && isMulti ? (
                    <>
                      {cellValue(first, col.key)}
                      <span className="ml-2 inline-block text-xs font-semibold px-2 py-0.5 rounded bg-purple-100 text-purple-800 align-middle whitespace-nowrap">
                        {g.units.length} units
                      </span>
                    </>
                  ) : col.key === "status" && isMulti ? (
                    <span className="text-xs font-semibold space-x-1">
                      {pending > 0 && <span className="text-yellow-700">{pending} pending</span>}
                      {inspected > 0 && <span className="text-green-700">{inspected} inspected</span>}
                      {shipped > 0 && <span className="text-purple-700">{shipped} shipped</span>}
                    </span>
                  ) : (
                    cellValue(first, col.key)
                  )}
                </td>
              )
          )}
        </tr>
        {isExpanded &&
          g.units.slice(1).map((item, idx) => (
            <tr
              key={item.id}
              className="bg-purple-50 hover:bg-purple-100 cursor-pointer"
              onClick={() => openDetail(item.id)}
            >
              <td className="p-2 border border-l-4 border-l-purple-400 text-center text-purple-400 font-bold">↳</td>
              {COLUMNS.map(
                (col) =>
                  visibleColumns[col.key] && (
                    <td
                      key={col.key}
                      className={col.key === "tracking" ? "p-2 border" : cellClass(col.key)}
                      onClick={col.key === "tracking" ? undefined : cellCopyHandler(item, col.key)}
                    >
                      {col.key === "tracking" ? (
                        <span className="text-xs text-gray-400 whitespace-nowrap">
                          unit {item.unitIndex || idx + 2}
                          {item.groupSize ? ` of ${item.groupSize}` : ""}
                        </span>
                      ) : (
                        cellValue(item, col.key)
                      )}
                    </td>
                  )
              )}
            </tr>
          ))}
      </React.Fragment>
    );
  };

  return (
    <div className="p-6">
      <div className="sticky top-0 z-50 bg-gray-100">
        <h1 className="text-2xl font-bold mb-4">Returns List</h1>
        <div className="flex space-x-2 mb-4">
          <Link to="/returns/input">
            <button className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">
              Input
            </button>
          </Link>
          <button
            onClick={() => navigate("/dashboard")}
            className="bg-orange-500 text-white px-4 py-2 rounded hover:bg-orange-600"
          >
            Home
          </button>
          <button
            onClick={() => navigate("/returns/ship")}
            className="bg-purple-500 text-white px-4 py-2 rounded hover:bg-purple-600"
          >
            Ship Out
          </button>
          <button
            onClick={() => navigate("/returns/report")}
            className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
          >
            Report
          </button>
          <button
            onClick={loadData}
            className="bg-gray-200 text-gray-800 px-4 py-2 rounded hover:bg-gray-300"
          >
            Refresh
          </button>
        </div>

        <div className="bg-white p-4 rounded-lg shadow mb-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-gray-700 font-bold mb-2">Search</label>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="File No, tracking, laptop, serial, pallet, ship batch…"
                className="w-full p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-4 items-center justify-between">
            <div className="flex flex-wrap gap-4">
              <div>
                <label className="block text-gray-700 font-bold mb-2">Status</label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  <option value="">All Statuses</option>
                  <option value="pending">Pending inspection</option>
                  <option value="done">Inspected, not shipped</option>
                  <option value="shipped">Shipped</option>
                </select>
              </div>
              <div>
                <label className="block text-gray-700 font-bold mb-2">Pallet</label>
                <select
                  value={palletFilter}
                  onChange={(e) => setPalletFilter(e.target.value)}
                  className="w-full p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  <option value="">All Pallets</option>
                  {pallets.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-gray-700 font-bold mb-2">Bulk Type</label>
                <select
                  value={bulkFilter}
                  onChange={(e) => setBulkFilter(e.target.value)}
                  className="w-full p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  <option value="">All Bulk Types</option>
                  <option value="New Bulk">New Bulk</option>
                  <option value="Old Bulk">Old Bulk</option>
                  <option value="__none__">Not set</option>
                </select>
              </div>
              <div>
                <label className="block text-gray-700 font-bold mb-2">View</label>
                <select
                  value={combine ? "combined" : "expanded"}
                  onChange={(e) => setCombine(e.target.value === "combined")}
                  className="w-full p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  <option value="combined">Combine by tracking</option>
                  <option value="expanded">Show every unit</option>
                </select>
              </div>
            </div>
            <div className="flex items-center h-full">
              <button
                type="button"
                onClick={handleReset}
                className="bg-red-600 hover:bg-red-700 m-2 text-white font-semibold px-6 py-2 rounded shadow"
              >
                Reset
              </button>
            </div>
          </div>
        </div>

        <div className="flex justify-between items-center mb-4">
          <div className="flex space-x-4">
            <span>
              Total Count: {filtered.length}
              {groups.length !== filtered.length && (
                <> ({groups.length} tracking group{groups.length === 1 ? "" : "s"})</>
              )}
            </span>
          </div>
          <div className="relative">
            <button
              onClick={() => setShowColumnFilter(!showColumnFilter)}
              className="bg-gray-200 px-4 py-2 rounded"
            >
              Filter Columns ▼
            </button>
            {showColumnFilter && (
              <div className="absolute right-0 mt-2 bg-white p-4 rounded shadow-lg z-10 min-w-[200px] max-w-[250px]">
                {COLUMNS.map((col) => (
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

      {loading ? (
        <div className="p-12 flex justify-center">
          <ClipLoader color="#4B5563" size={40} />
        </div>
      ) : error ? (
        <div className="bg-red-100 text-red-800 p-6 rounded-lg text-center">{error}</div>
      ) : pageGroups.length === 0 ? (
        <p className="text-gray-500">No matching returns.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse bg-white shadow rounded">
              <thead>
                <tr className="bg-gray-200 sticky z-40">
                  <th className="p-2 border"></th>
                  {COLUMNS.map(
                    (col) =>
                      visibleColumns[col.key] && (
                        <th
                          key={col.key}
                          className="p-2 border cursor-pointer hover:bg-blue-100"
                          onClick={() => handleSort(col.key)}
                        >
                          {col.label}
                          {sortConfig.key === col.key && (
                            <span>{sortConfig.direction === "asc" ? " ▲" : " ▼"}</span>
                          )}
                        </th>
                      )
                  )}
                </tr>
              </thead>
              <tbody>
                {pageGroups.map((g, i) =>
                  renderGroupRow(g, g.tracking || `row-${(currentPage - 1) * PAGE_SIZE + i}`)
                )}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-4 flex-wrap">
              <button
                disabled={currentPage === 1}
                onClick={() => setPage(currentPage - 1)}
                className="px-3 py-1.5 border border-gray-300 rounded text-sm font-semibold bg-white disabled:opacity-40"
              >
                ‹ Prev
              </button>
              <span className="text-sm text-gray-600">
                Page {currentPage} of {totalPages}
              </span>
              <button
                disabled={currentPage === totalPages}
                onClick={() => setPage(currentPage + 1)}
                className="px-3 py-1.5 border border-gray-300 rounded text-sm font-semibold bg-white disabled:opacity-40"
              >
                Next ›
              </button>
            </div>
          )}
        </>
      )}

      {toast.visible && (
        <div className="fixed bottom-4 right-4 bg-gray-800 text-white px-4 py-2 rounded shadow-lg z-50">
          {toast.message}
        </div>
      )}
    </div>
  );
}

export default ReturnsList;
