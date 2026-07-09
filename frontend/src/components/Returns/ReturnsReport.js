import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ClipLoader } from "react-spinners";

const API = `http://${window.location.hostname}:8088`;

function formatMonth(ym) {
  const parts = (ym || "").split("-");
  if (parts.length !== 2) return ym;
  const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, 1);
  if (isNaN(d.getTime())) return ym;
  return d.toLocaleString(undefined, { month: "long", year: "numeric" });
}

function ReturnsReport() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`${API}/returns/report`)
      .then((r) => r.json())
      .then((res) => {
        if (res.status === "success") setData(res);
        else setError(res.message || "Could not load report.");
        setLoading(false);
      })
      .catch((err) => { setError(String(err)); setLoading(false); });
  }, []);

  const exportCsv = () => {
    if (!data || !data.months) return;
    const rows = [["Month", "Received", "Inspected", "Shipped"]];
    data.months.forEach((m) => rows.push([m.month, m.received, m.inspected, m.shipped]));
    if (data.totals) rows.push(["TOTAL", data.totals.received, data.totals.inspected, data.totals.shipped]);
    const csv = rows.map((r) => r.map((c) => {
      const s = String(c);
      return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `returns-monthly-report_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const months = (data && data.months) || [];
  const totals = (data && data.totals) || { received: 0, inspected: 0, shipped: 0 };
  const maxVal = Math.max(1, ...months.flatMap((m) => [m.received, m.inspected, m.shipped]));

  const card = "bg-white rounded-lg shadow-sm p-6 mb-4";

  return (
    <div className="max-w-3xl mx-auto p-5">
      <h1 className="text-2xl font-bold mb-4">Monthly Report</h1>
      <div className="flex space-x-2 mb-4">
        <button
          onClick={() => navigate("/returns")}
          className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
        >
          Back
        </button>
        <button
          onClick={exportCsv}
          className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
        >
          Export CSV
        </button>
        <button
          onClick={() => window.print()}
          className="bg-purple-500 text-white px-4 py-2 rounded hover:bg-purple-600"
        >
          🖨️ Print
        </button>
      </div>

      {loading ? (
        <div className="p-12 flex justify-center"><ClipLoader color="#6366f1" size={36} /></div>
      ) : error ? (
        <div className="bg-red-100 text-red-800 p-5 rounded-lg text-center">{error}</div>
      ) : months.length === 0 ? (
        <div className={`${card} text-center text-gray-500`}>No data yet.</div>
      ) : (
        <>
          <div className={card}>
            <h2 className="text-base font-bold mb-3.5">All-time totals</h2>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Received", num: totals.received, bg: "bg-blue-50", color: "text-blue-700" },
                { label: "Inspected", num: totals.inspected, bg: "bg-green-50", color: "text-emerald-700" },
                { label: "Shipped", num: totals.shipped, bg: "bg-purple-50", color: "text-purple-700" },
              ].map((t) => (
                <div key={t.label} className={`${t.bg} p-4 rounded-lg text-center`}>
                  <div className="text-xs font-bold uppercase tracking-wide text-gray-500">{t.label}</div>
                  <div className={`text-3xl font-bold mt-1.5 ${t.color}`}>{t.num}</div>
                </div>
              ))}
            </div>
          </div>

          <div className={card}>
            <h2 className="text-base font-bold mb-3.5">Monthly breakdown</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                    <th className="text-left p-2.5 border-b border-gray-200">Month</th>
                    <th className="text-right p-2.5 border-b border-gray-200">Received</th>
                    <th className="text-right p-2.5 border-b border-gray-200">Inspected</th>
                    <th className="text-right p-2.5 border-b border-gray-200">Shipped</th>
                  </tr>
                </thead>
                <tbody>
                  {months.map((m) => (
                    <tr key={m.month}>
                      <td className="p-2.5 border-b border-gray-100">
                        <div className="font-bold text-gray-800">{formatMonth(m.month)}</div>
                        <div className="text-xs text-gray-400">{m.month}</div>
                      </td>
                      {[["received", "bg-blue-500"], ["inspected", "bg-emerald-500"], ["shipped", "bg-purple-500"]].map(([k, bar]) => (
                        <td key={k} className="p-2.5 border-b border-gray-100 text-right tabular-nums">
                          <div>{m[k]}</div>
                          {m[k] > 0 && (
                            <div className="h-1.5 rounded bg-gray-200 mt-1 ml-auto w-24 overflow-hidden">
                              <div className={`h-full rounded ${bar}`} style={{ width: `${Math.max(2, Math.round((m[k] / maxVal) * 100))}%` }} />
                            </div>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default ReturnsReport;
