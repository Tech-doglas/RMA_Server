import React, { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ClipLoader } from "react-spinners";
import copy from "copy-to-clipboard";
import Toast from "../common/Toast";

const API = `http://${window.location.hostname}:8088`;

// Lazy-load JsBarcode from CDN (matches the original Apps Script approach,
// so no npm dependency is required).
let barcodePromise = null;
function loadJsBarcode() {
  if (window.JsBarcode) return Promise.resolve(window.JsBarcode);
  if (!barcodePromise) {
    barcodePromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js";
      s.onload = () => resolve(window.JsBarcode);
      s.onerror = () => reject(new Error("barcode library failed to load"));
      document.body.appendChild(s);
    });
  }
  return barcodePromise;
}

function formatTimestamp(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  if (isNaN(d.getTime())) return String(ts);
  return d.toLocaleString();
}

function ReturnsDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);
  const [saving, setSaving] = useState(false);
  const barcodeRef = useRef(null);

  // inspection form state
  const [inspectionDate, setInspectionDate] = useState("");
  const [pallet, setPallet] = useState("");
  const [serial, setSerial] = useState("");
  const [inspectionRemark, setInspectionRemark] = useState("");

  const load = () => {
    setLoading(true);
    fetch(`${API}/returns/${encodeURIComponent(id)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.status === "success") {
          setItem(data.item);
          // Default the inspection date to today so a fresh inspection is one scan + save.
          setInspectionDate(data.item.inspectionDate || new Date().toISOString().slice(0, 10));
          setPallet(data.item.pallet || "");
          setSerial(data.item.serial || "");
          setInspectionRemark(data.item.inspectionRemark || "");
        } else {
          setError(data.message || "Not found");
        }
        setLoading(false);
      })
      .catch((err) => {
        setError(String(err));
        setLoading(false);
      });
  };

  useEffect(load, [id]);

  // Existing pallets as suggestions for the inspection form.
  const [palletOptions, setPalletOptions] = useState([]);
  useEffect(() => {
    fetch(`${API}/returns/pallets`)
      .then((r) => r.json())
      .then((res) => {
        if (res.status === "success") {
          setPalletOptions((res.pallets || []).map((p) => p.pallet).filter(Boolean));
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!item || !item.fileNo || !barcodeRef.current) return;
    loadJsBarcode()
      .then((JsBarcode) => {
        try {
          JsBarcode(barcodeRef.current, item.fileNo, {
            format: "CODE128", width: 2, height: 60, displayValue: true, fontSize: 14, margin: 6,
          });
        } catch (e) { /* ignore render error */ }
      })
      .catch(() => {});
  }, [item]);

  const saveBulkType = (value) => {
    fetch(`${API}/returns/bulk-type`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id, bulkType: value }),
    })
      .then((r) => r.json())
      .then((res) => {
        if (res.status === "success") {
          setItem((prev) => ({ ...prev, bulkType: res.bulkType }));
          const n = res.updatedCount || 1;
          setToast({ message: n > 1 ? `Bulk type set for ${n} units` : "Bulk type saved", type: "success" });
        } else setToast({ message: res.message || "Save failed", type: "error" });
      })
      .catch((err) => setToast({ message: "Save failed: " + err, type: "error" }));
  };

  const saveInspection = () => {
    if (!inspectionDate) return setToast({ message: "Inspection date is required.", type: "error" });
    if (!serial.trim()) return setToast({ message: "Serial number is required.", type: "error" });
    setSaving(true);
    fetch(`${API}/returns/inspection`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: item.id, inspectionDate, pallet: pallet.trim(), serial: serial.trim(), inspectionRemark: inspectionRemark.trim(),
      }),
    })
      .then((r) => r.json())
      .then((res) => {
        setSaving(false);
        if (res.status === "success") {
          setToast({ message: "Inspection saved", type: "success" });
          load();
        } else setToast({ message: res.message || "Save failed", type: "error" });
      })
      .catch((err) => { setSaving(false); setToast({ message: "Save failed: " + err, type: "error" }); });
  };

  if (loading) return <div className="p-6 flex justify-center"><ClipLoader color="#4B5563" size={40} /></div>;
  if (error) return <div className="max-w-3xl mx-auto p-6"><div className="bg-white p-6 rounded-lg text-red-800">{error}</div></div>;

  const Row = ({ label, children }) => (
    <>
      <div className="text-gray-500 font-semibold">{label}</div>
      <div className="text-gray-800 break-words">{children || "—"}</div>
    </>
  );

  const Copyable = ({ value }) =>
    value ? (
      <span
        onClick={() => {
          let copied = false;
          try {
            copied = copy(value);
          } catch {
            copied = false;
          }
          if (copied) setToast({ message: `Copied: ${value}`, type: "success" });
        }}
        title="Click to copy"
        className="cursor-pointer hover:bg-gray-200 rounded px-0.5"
      >
        {value}
      </span>
    ) : null;

  // Print just the barcode label (bars + File No), nothing else: no page
  // title, and @page margin 0 suppresses the browser's header/footer text.
  const printBarcode = () => {
    const svg = barcodeRef.current ? barcodeRef.current.outerHTML : "";
    if (!svg) return;
    const w = window.open("", "_blank", "width=420,height=260");
    if (!w) return;
    w.document.write(
      "<html><head><title> </title>" +
      "<style>@page{margin:0}html,body{margin:0;height:100%}" +
      "body{display:flex;align-items:center;justify-content:center}</style>" +
      "</head><body>" + svg +
      "<script>window.onafterprint=function(){window.close()};</" + "script>" +
      "</body></html>"
    );
    w.document.close();
    w.focus();
    w.print();
  };

  const allSiblings = [
    ...(item.siblings || []),
    { id: item.id, fileNo: item.fileNo, unitIndex: item.unitIndex, laptop: item.laptop, inspectionDate: item.inspectionDate, current: true },
  ].sort((a, b) => {
    const ai = parseInt(a.unitIndex, 10), bi = parseInt(b.unitIndex, 10);
    if (isNaN(ai) && isNaN(bi)) return 0;
    if (isNaN(ai)) return 1;
    if (isNaN(bi)) return -1;
    return ai - bi;
  });

  const card = "bg-white rounded-lg shadow-sm p-6 mb-4";

  return (
    <>
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
      <div className="max-w-3xl mx-auto p-5">
        <button
          onClick={() => navigate("/returns")}
          className="mb-4 bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
        >
          Back
        </button>

        <div className={card}>
          <h1 className="text-2xl font-bold mb-1 flex items-center gap-2.5 flex-wrap">
            Return{" "}
            <span
              className="font-mono text-base font-bold text-purple-800 bg-purple-100 px-3 py-1 rounded cursor-pointer hover:bg-purple-200"
              title="Click to copy"
              onClick={() => {
                let copied = false;
                try {
                  copied = copy(item.fileNo || "");
                } catch {
                  copied = false;
                }
                if (copied) setToast({ message: `Copied: ${item.fileNo}`, type: "success" });
              }}
            >
              {item.fileNo || "—"}
            </span>
            <span
              className={`text-xs font-semibold px-2 py-1 rounded ${
                item.shipDate
                  ? "bg-purple-100 text-purple-800"
                  : item.inspectionDate
                  ? "bg-green-100 text-green-800"
                  : "bg-yellow-100 text-yellow-800"
              }`}
            >
              {item.shipDate ? "Shipped" : item.inspectionDate ? "Inspected" : "Pending inspection"}
            </span>
          </h1>
          <div className="grid grid-cols-[140px_1fr] gap-y-2 gap-x-3.5 text-sm mt-3">
            <Row label="Tracking #"><Copyable value={item.tracking} /></Row>
            <Row label="Laptop">{item.laptop}</Row>
            <Row label="Received">{item.receivedDate}</Row>
            <Row label="Submitted">{formatTimestamp(item.timestamp)}</Row>
            {item.bulkType && <Row label="Bulk type">{item.bulkType}</Row>}
            {item.inspectionDate ? (
              <>
                <Row label="Inspection">{item.inspectionDate}</Row>
                {item.pallet && <Row label="Pallet">{item.pallet}</Row>}
                {item.serial && <Row label="Serial #"><Copyable value={item.serial} /></Row>}
                {item.inspectionRemark && <Row label="Insp. remark">{item.inspectionRemark}</Row>}
              </>
            ) : (
              <Row label="Inspection"><span className="text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded text-xs">Pending</span></Row>
            )}
            {item.shipDate && (
              <>
                <Row label="Shipped">{item.shipDate}</Row>
                {item.shipBatch && <Row label="Ship batch">{item.shipBatch}</Row>}
              </>
            )}
            {item.remark && <Row label="Submit remark">{item.remark}</Row>}
          </div>
        </div>

        <div className={card}>
          <h2 className="text-base font-bold text-gray-700 mb-3">File No Barcode</h2>
          <div className="text-center">
            <svg ref={barcodeRef} />
            <div>
              <button onClick={printBarcode} className="mt-2 bg-white border border-gray-300 px-3.5 py-1.5 rounded text-sm font-semibold hover:bg-gray-50">🖨 Print label</button>
            </div>
          </div>
        </div>

        {allSiblings.length > 1 && (
          <div className={card}>
            <h2 className="text-base font-bold text-gray-700 mb-3">Units in this shipment ({item.groupSize})</h2>
            <div className="flex flex-col gap-1.5">
              {allSiblings.map((sib) => (
                <div
                  key={sib.id}
                  onClick={() => !sib.current && navigate(`/returns/${encodeURIComponent(sib.id)}`)}
                  className={`flex items-center gap-2.5 px-3 py-2.5 border rounded-lg text-sm ${sib.current ? "bg-purple-50 border-purple-200" : "border-gray-200 hover:bg-gray-50 cursor-pointer"}`}
                >
                  <span className="font-mono font-bold text-purple-800">{sib.fileNo || sib.id}</span>
                  {sib.unitIndex && <span className="text-gray-500">Unit {sib.unitIndex}</span>}
                  {sib.laptop && <span className="text-gray-500">{sib.laptop}</span>}
                  <span className={`ml-auto text-xs ${sib.inspectionDate ? "text-emerald-700" : "text-amber-800"}`}>
                    {sib.inspectionDate ? "✓ Inspected" : "Pending"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className={card}>
          <h2 className="text-base font-bold text-gray-700 mb-3">Bulk type</h2>
          <div className="flex gap-2 flex-wrap">
            {["New Bulk", "Old Bulk"].map((opt) => (
              <button
                key={opt}
                onClick={() => saveBulkType(opt)}
                className={`flex-1 min-w-[120px] text-center px-3 py-2.5 border rounded text-sm font-semibold ${item.bulkType === opt ? "border-purple-800 bg-purple-100 text-purple-800" : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"}`}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>

        <div className={card}>
          <h2 className="text-base font-bold text-gray-700 mb-3">Inspection</h2>
          <label className="block text-sm font-bold text-gray-700 mb-1">Inspection date</label>
          <input type="date" value={inspectionDate} onChange={(e) => setInspectionDate(e.target.value)} className="w-full p-2.5 border border-gray-300 rounded text-sm mb-3.5" />
          <label className="block text-sm font-bold text-gray-700 mb-1">Pallet</label>
          <input type="text" value={pallet} onChange={(e) => setPallet(e.target.value)} placeholder="e.g. P-12" list="pallet-options" className="w-full p-2.5 border border-gray-300 rounded text-sm mb-3.5" />
          <datalist id="pallet-options">
            {palletOptions.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
          <label className="block text-sm font-bold text-gray-700 mb-1">Serial number</label>
          <input type="text" value={serial} onChange={(e) => setSerial(e.target.value)} placeholder="Scan or type serial #" className="w-full p-2.5 border border-gray-300 rounded text-sm mb-3.5" />
          <label className="block text-sm font-bold text-gray-700 mb-1">Inspection remark</label>
          <textarea value={inspectionRemark} onChange={(e) => setInspectionRemark(e.target.value)} placeholder="Notes from inspection (optional)" className="w-full p-2.5 border border-gray-300 rounded text-sm mb-3.5 min-h-[64px]" />
          <button onClick={saveInspection} disabled={saving} className="w-full bg-blue-600 text-white py-2.5 rounded font-semibold hover:bg-blue-700 disabled:opacity-60">
            {saving ? "Saving…" : "Save inspection"}
          </button>
        </div>

        <ImagesCard title="Photos of this unit" empty="No unit-specific photos." urls={item.unitImages} />
        <ImagesCard title="Label / shipment photos" empty="No shipment photos." urls={item.images} />
      </div>
    </>
  );
}

function ImagesCard({ title, empty, urls }) {
  return (
    <div className="bg-white rounded-lg shadow-sm p-6 mb-4">
      <h2 className="text-base font-bold text-gray-700 mb-3">{title}</h2>
      {urls && urls.length ? (
        <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))" }}>
          {urls.map((u, i) => (
            <a key={i} href={`${API}${u}`} target="_blank" rel="noopener noreferrer" className="block rounded-lg overflow-hidden border border-gray-200 aspect-square">
              <img src={`${API}${u}`} alt="" loading="lazy" className="w-full h-full object-cover" />
            </a>
          ))}
        </div>
      ) : (
        <div className="text-gray-400 text-sm italic">{empty}</div>
      )}
    </div>
  );
}

export default ReturnsDetail;
