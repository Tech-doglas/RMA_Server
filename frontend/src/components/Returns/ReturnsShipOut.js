import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Toast from "../common/Toast";

const API = `http://${window.location.hostname}:8088`;

function ReturnsShipOut() {
  const navigate = useNavigate();
  const [toast, setToast] = useState(null);
  const [pallets, setPallets] = useState([]);
  const [currentPallet, setCurrentPallet] = useState(null);
  const [units, setUnits] = useState([]);
  const [selected, setSelected] = useState({}); // id -> bool
  const [shipDate, setShipDate] = useState("");
  const [loadingUnits, setLoadingUnits] = useState(false);
  const [shipping, setShipping] = useState(false);

  useEffect(() => setShipDate(new Date().toISOString().slice(0, 10)), []);

  const loadPallets = (reselect) => {
    fetch(`${API}/returns/pallets`)
      .then((r) => r.json())
      .then((res) => {
        if (res.status === "success") {
          setPallets(res.pallets || []);
          if (reselect) {
            const still = (res.pallets || []).some((p) => p.pallet === reselect && p.ready > 0);
            if (still) selectPallet(reselect);
            else { setCurrentPallet(null); setUnits([]); }
          }
        } else setToast({ message: res.message || "Could not load pallets", type: "error" });
      })
      .catch((err) => setToast({ message: "Could not load pallets: " + err, type: "error" }));
  };

  useEffect(() => loadPallets(null), []);

  const selectPallet = (pallet) => {
    setCurrentPallet(pallet);
    setLoadingUnits(true);
    fetch(`${API}/returns/pallets/${encodeURIComponent(pallet)}/units`)
      .then((r) => r.json())
      .then((res) => {
        setLoadingUnits(false);
        if (res.status === "success") {
          const list = res.units || [];
          setUnits(list);
          const sel = {};
          list.forEach((u) => { if (!u.shipDate && u.inspectionDate) sel[u.id] = true; });
          setSelected(sel);
        } else setToast({ message: res.message || "Could not load units", type: "error" });
      })
      .catch((err) => { setLoadingUnits(false); setToast({ message: "Could not load units: " + err, type: "error" }); });
  };

  const readyIds = units.filter((u) => u.inspectionDate && !u.shipDate).map((u) => u.id);
  const selectedIds = Object.keys(selected).filter((id) => selected[id] && readyIds.includes(id));

  const toggle = (id) => setSelected((prev) => ({ ...prev, [id]: !prev[id] }));
  const selectAll = () => { const s = {}; readyIds.forEach((id) => (s[id] = true)); setSelected(s); };
  const selectNone = () => setSelected({});

  const ship = () => {
    if (!selectedIds.length) return setToast({ message: "No units selected.", type: "error" });
    if (!shipDate) return setToast({ message: "Ship date is required.", type: "error" });
    setShipping(true);
    const isWholePallet = selectedIds.length === readyIds.length;
    fetch(`${API}/returns/ship`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shipDate, unitIds: selectedIds, ...(isWholePallet ? { pallet: currentPallet } : {}) }),
    })
      .then((r) => r.json())
      .then((res) => {
        setShipping(false);
        if (res.status === "success") {
          let msg = `✓ Shipped ${res.shippedCount} unit(s) under batch ${res.batchId}.`;
          if (res.skipped && res.skipped.length) msg += ` Skipped ${res.skipped.length}.`;
          setToast({ message: msg, type: "success" });
          loadPallets(currentPallet);
        } else setToast({ message: "Error: " + (res.message || "Unknown error"), type: "error" });
      })
      .catch((err) => { setShipping(false); setToast({ message: "Ship failed: " + err, type: "error" }); });
  };

  const card = "bg-white rounded-lg shadow-sm p-6 mb-4";

  return (
    <>
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
      <div className="max-w-3xl mx-auto p-5">
        <h1 className="text-2xl font-bold mb-4">Ship Out</h1>
        <button
          onClick={() => navigate("/returns")}
          className="mb-4 bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
        >
          Back
        </button>

        <div className={card}>
          <h2 className="text-base font-bold mb-2">1. Select a pallet</h2>
          <div className="text-xs text-gray-500 mb-3">Ready = inspected but not shipped.</div>
          {pallets.length === 0 ? (
            <div className="text-center text-gray-500 py-5">No pallets yet. Assign units to pallets via inspection.</div>
          ) : (
            <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}>
              {pallets.map((p) => (
                <div
                  key={p.pallet}
                  onClick={() => p.ready > 0 && selectPallet(p.pallet)}
                  className={`border rounded-lg p-3.5 ${p.ready === 0 ? "opacity-55 cursor-not-allowed bg-gray-50" : "cursor-pointer hover:border-purple-500 hover:bg-purple-50"} ${currentPallet === p.pallet ? "border-purple-700 bg-purple-100" : "border-gray-300 bg-gray-50"}`}
                >
                  <div className="font-bold text-gray-800 mb-1">{p.pallet}</div>
                  <div className="flex gap-2 flex-wrap text-xs">
                    <span className="px-1.5 py-0.5 rounded-full font-semibold text-emerald-800 bg-emerald-100">{p.ready} ready</span>
                    {p.shipped > 0 && <span className="px-1.5 py-0.5 rounded-full font-semibold text-purple-800 bg-purple-100">{p.shipped} shipped</span>}
                    <span className="px-1.5 py-0.5 rounded-full font-semibold text-gray-600 bg-gray-100">{p.total} total</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {currentPallet && (
          <div className={card}>
            <h2 className="text-base font-bold mb-2">2. Choose units to ship</h2>
            <div className="flex gap-3 mb-2.5 text-sm">
              <button onClick={selectAll} className="text-blue-500 font-semibold hover:underline">Select all ready</button>
              <button onClick={selectNone} className="text-blue-500 font-semibold hover:underline">Select none</button>
            </div>
            {loadingUnits ? (
              <div className="text-center text-gray-500 py-5">Loading units…</div>
            ) : units.length === 0 ? (
              <div className="text-center text-gray-500 py-5">No units on this pallet.</div>
            ) : (
              units.map((u) => {
                const canShip = !u.shipDate && !!u.inspectionDate;
                return (
                  <div key={u.id} className={`flex items-center gap-3 px-3 py-2.5 border rounded-lg mb-1.5 ${u.shipDate ? "bg-gray-50 opacity-70" : "bg-white border-gray-200"}`}>
                    <input type="checkbox" disabled={!canShip} checked={!!selected[u.id] && canShip} onChange={() => toggle(u.id)} className="w-4 h-4" />
                    <span className="font-mono text-xs font-bold text-purple-800 bg-purple-100 px-2 py-1 rounded">{u.fileNo || u.id}</span>
                    <div className="flex-1">
                      <div className="text-sm text-gray-800">{u.laptop || "(no laptop name)"}</div>
                      <div className="text-xs text-gray-500">
                        {[u.serial && `SN: ${u.serial}`, u.inspectionDate && `Insp: ${u.inspectionDate}`, u.shipDate && `Shipped: ${u.shipDate}${u.shipBatch ? " · " + u.shipBatch : ""}`].filter(Boolean).join(" · ") || "(no details)"}
                      </div>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${u.shipDate ? "text-purple-800 bg-purple-100" : u.inspectionDate ? "text-emerald-800 bg-emerald-100" : "text-amber-800 bg-amber-100"}`}>
                      {u.shipDate ? "shipped" : u.inspectionDate ? "ready" : "not inspected"}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        )}

        {currentPallet && (
          <div className={card}>
            <h2 className="text-base font-bold mb-2">3. Confirm shipment</h2>
            <div className="text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded p-3 mb-3.5">
              <strong>{selectedIds.length}</strong> unit{selectedIds.length === 1 ? "" : "s"} selected from <strong>{currentPallet}</strong>
              {selectedIds.length === readyIds.length ? " (whole pallet)" : " (partial)"}.
            </div>
            <label className="block text-sm font-bold mb-1.5">Ship Date<span className="text-red-600">*</span></label>
            <input type="date" value={shipDate} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setShipDate(e.target.value)} className="w-full max-w-xs p-2.5 border border-gray-300 rounded text-sm" />
            <button onClick={ship} disabled={shipping || !selectedIds.length} className="mt-4 w-full bg-purple-500 text-white py-3 rounded font-semibold hover:bg-purple-600 disabled:bg-gray-400">
              {shipping ? "Shipping…" : "📦 Ship Selected Units"}
            </button>
          </div>
        )}
      </div>
    </>
  );
}

export default ReturnsShipOut;
