import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Toast from "../common/Toast";

const API = `http://${window.location.hostname}:8088`;
const MAX_DIMENSION = 1200;

// Resize/compress an image file to a JPEG under ~1200px wide before upload.
function resizeImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        try {
          const scale = Math.min(1, MAX_DIMENSION / img.width);
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));
          canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(
            (blob) => {
              if (!blob) return reject(new Error(`Could not process "${file.name}"`));
              const base = (file.name || "image").replace(/\.[^.]+$/, "");
              resolve(new File([blob], `${base}.jpg`, { type: "image/jpeg" }));
            },
            "image/jpeg",
            0.85
          );
        } catch (err) {
          reject(new Error(`Could not process "${file.name}": ${err.message}`));
        }
      };
      img.onerror = () => reject(new Error(`Could not decode "${file.name}" (HEIC not supported — use JPG/PNG).`));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error(`Could not read "${file.name}".`));
    reader.readAsDataURL(file);
  });
}

function ReturnsInput() {
  const navigate = useNavigate();
  const [toast, setToast] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [tracking, setTracking] = useState("");
  const [receivedDate, setReceivedDate] = useState("");
  const [remark, setRemark] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [labelFiles, setLabelFiles] = useState([]);
  const [units, setUnits] = useState([{ laptop: "", files: [] }]);

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    setReceivedDate(today);
  }, []);

  // Keep the units array length in sync with quantity, preserving entered data.
  useEffect(() => {
    const qty = Math.max(1, parseInt(quantity, 10) || 1);
    setUnits((prev) => {
      const next = prev.slice(0, qty);
      while (next.length < qty) next.push({ laptop: "", files: [] });
      return next;
    });
  }, [quantity]);

  const setUnitLaptop = (i, val) =>
    setUnits((prev) => prev.map((u, idx) => (idx === i ? { ...u, laptop: val } : u)));
  const setUnitFiles = (i, files) =>
    setUnits((prev) => prev.map((u, idx) => (idx === i ? { ...u, files: Array.from(files) } : u)));

  const removeLabelFile = (i) =>
    setLabelFiles((prev) => prev.filter((_, idx) => idx !== i));
  const removeUnitFile = (i, fi) =>
    setUnits((prev) =>
      prev.map((u, idx) => (idx === i ? { ...u, files: u.files.filter((_, fidx) => fidx !== fi) } : u))
    );

  const applyNameToAllUnits = () =>
    setUnits((prev) => prev.map((u) => ({ ...u, laptop: prev[0].laptop })));

  const qty = Math.max(1, parseInt(quantity, 10) || 1);

  // Barcode scanners send Enter after the code; keep that from submitting a
  // half-filled form. Submit happens only via the Submit button.
  const preventEnterSubmit = (e) => {
    if (e.key === "Enter" && e.target.tagName === "INPUT") e.preventDefault();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!tracking.trim()) return setToast({ message: "Tracking number is required.", type: "error" });
    if (labelFiles.length === 0) return setToast({ message: "Please add at least one shipping label image.", type: "error" });
    for (let i = 0; i < units.length; i++) {
      if (!units[i].laptop.trim()) return setToast({ message: `Please enter a laptop name for Unit ${i + 1}.`, type: "error" });
    }

    setSubmitting(true);
    setToast({ message: "Processing images & uploading…", type: "success" });
    try {
      const data = new FormData();
      data.append("tracking", tracking.trim());
      data.append("receivedDate", receivedDate);
      data.append("quantity", String(qty));
      data.append("remark", remark.trim());

      const labels = await Promise.all(labelFiles.map(resizeImage));
      labels.forEach((f) => data.append("images", f));

      for (let i = 0; i < units.length; i++) {
        data.append(`unit_laptop_${i}`, units[i].laptop.trim());
        const imgs = await Promise.all(units[i].files.map(resizeImage));
        imgs.forEach((f) => data.append(`unit_images_${i}`, f));
      }

      const res = await fetch(`${API}/returns/submit`, { method: "POST", body: data });
      const result = await res.json();
      if (res.ok && result.status === "success") {
        const ids = result.fileNos || [result.fileNo];
        setToast({ message: "✔️ Saved! Assigned: " + ids.join(", "), type: "success" });
        setTimeout(() => navigate("/returns"), 900);
      } else {
        setToast({ message: "Error: " + (result.message || "Unknown error"), type: "error" });
        setSubmitting(false);
      }
    } catch (err) {
      setToast({ message: "Submission failed: " + (err.message || err), type: "error" });
      setSubmitting(false);
    }
  };

  return (
    <>
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
      <div className="w-full bg-white rounded-lg shadow p-6 max-w-xl mx-auto mt-4">
        <h1 className="text-2xl font-bold mb-4 text-center">Input New Returns Item</h1>
        <button
          onClick={() => navigate("/returns")}
          className="mb-4 bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
        >
          Back
        </button>

        <form onSubmit={handleSubmit} onKeyDown={preventEnterSubmit}>
          <div className="mb-4">
            <label className="block text-gray-700 font-bold mb-2">Tracking Number<span className="text-red-600">*</span></label>
            <input type="text" value={tracking} onChange={(e) => setTracking(e.target.value)} placeholder="Scan or type tracking #" autoFocus className="w-full p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-600" required />
          </div>

          <div className="mb-4">
            <label className="block text-gray-700 font-bold mb-2">Received Date<span className="text-red-600">*</span></label>
            <input type="date" value={receivedDate} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setReceivedDate(e.target.value)} className="w-full p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-600" required />
          </div>

          <div className="mb-4">
            <label className="block text-gray-700 font-bold mb-2">Quantity<span className="text-red-600">*</span></label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, (parseInt(q, 10) || 1) - 1))}
                disabled={qty <= 1}
                className="bg-gray-200 w-12 py-2 rounded text-lg font-bold hover:bg-gray-300 disabled:opacity-40"
                aria-label="Decrease quantity"
              >
                −
              </button>
              <input type="number" min="1" step="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="w-24 text-center p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-600" required />
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, (parseInt(q, 10) || 1) + 1))}
                className="bg-gray-200 w-12 py-2 rounded text-lg font-bold hover:bg-gray-300"
                aria-label="Increase quantity"
              >
                +
              </button>
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {qty === 1 ? "Will create 1 row with a new File No." : `Will create ${qty} rows, each with its own File No and laptop details.`}
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-gray-700 font-bold mb-2">Remark</label>
            <textarea value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="Optional notes about the shipment as a whole…" className="w-full p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-600 h-24" />
          </div>

          <div className="mb-4">
            <label className="block text-gray-700 font-bold mb-2">Shipping Label Images<span className="text-red-600">*</span></label>
            <div className="text-xs text-gray-500 mb-2">Shared across all units in this submission. Auto-resized before upload.</div>
            <input type="file" accept="image/*" multiple onChange={(e) => setLabelFiles(Array.from(e.target.files))} className="w-full p-2 border rounded" />
            {labelFiles.length > 0 && (
              <>
                <div className="text-xs text-gray-500 mt-1">{labelFiles.length} file(s) selected</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {labelFiles.map((file, i) => (
                    <div key={i} className="relative w-24 h-24 rounded overflow-hidden group">
                      <img src={URL.createObjectURL(file)} alt="Preview" className="w-full h-full object-cover rounded" />
                      <button
                        type="button"
                        onClick={() => removeLabelFile(i)}
                        className="absolute top-1 right-1 bg-red-600 text-white text-xs rounded-full w-6 h-6 flex items-center justify-center hover:bg-red-700 shadow-md"
                        title="Remove image"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="mb-4">
            <label className="block text-gray-700 font-bold mb-2">Unit Details<span className="text-red-600">*</span></label>
            <div className="text-xs text-gray-500 mb-2">Laptop name and (optional) per-unit photos.</div>
            <div className="flex flex-col gap-4">
              {units.map((u, i) => (
                <div key={i} className="border rounded-lg p-4 bg-gray-50">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-gray-700">{qty > 1 ? `Unit ${i + 1} of ${qty}` : "Unit Details"}</span>
                    {qty > 1 && <span className="font-mono text-xs font-semibold bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full">File No auto-assigned</span>}
                  </div>
                  <label className="block text-gray-700 font-bold mb-2">Laptop Name<span className="text-red-600">*</span></label>
                  <input type="text" value={u.laptop} onChange={(e) => setUnitLaptop(i, e.target.value)} placeholder="e.g., Dell Latitude 7420" className="w-full p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-600" required />
                  {i === 0 && qty > 1 && u.laptop.trim() && (
                    <button
                      type="button"
                      onClick={applyNameToAllUnits}
                      className="mt-2 text-blue-500 text-sm font-semibold hover:underline"
                    >
                      ↓ Apply this name to all {qty} units
                    </button>
                  )}
                  <label className="block text-gray-700 font-bold mb-2 mt-4">Photos of this unit</label>
                  <div className="text-xs text-gray-500 mb-1">Optional. e.g. damage, condition, serial sticker.</div>
                  <input type="file" accept="image/*" multiple onChange={(e) => setUnitFiles(i, e.target.files)} className="w-full p-2 border rounded" />
                  {u.files.length > 0 && (
                    <>
                      <div className="text-xs text-gray-500 mt-1">{u.files.length} file(s) selected</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {u.files.map((file, fi) => (
                          <div key={fi} className="relative w-24 h-24 rounded overflow-hidden group">
                            <img src={URL.createObjectURL(file)} alt="Preview" className="w-full h-full object-cover rounded" />
                            <button
                              type="button"
                              onClick={() => removeUnitFile(i, fi)}
                              className="absolute top-1 right-1 bg-red-600 text-white text-xs rounded-full w-6 h-6 flex items-center justify-center hover:bg-red-700 shadow-md"
                              title="Remove image"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>

          <button type="submit" disabled={submitting} className="w-full sm:w-auto bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50">
            {submitting ? "Submitting..." : "Submit"}
          </button>
        </form>
      </div>
    </>
  );
}

export default ReturnsInput;
