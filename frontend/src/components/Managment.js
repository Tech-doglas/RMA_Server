import { apiFetch } from './common/access';
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Toast from "./common/Toast";

function Management({ department }) {
  const navigate = useNavigate();
  const [toast, setToast] = useState(null);
  const [departmentName, setDepartmentName] = useState(null);

  useEffect(() => {
    switch (department) {
      case "Tech":
        setDepartmentName("laptop_TRP");
        break;
      case "Accounting":
        setDepartmentName("laptop_ARP");
        break;
      case "Sale":
        setDepartmentName("laptop_SRP");
        break;
      default:
        break;
    }
  }, [department]);

  const handleExport = async (type) => {
    console.log(departmentName, type);
    const url = `http://${window.location.hostname}:8088/report/${departmentName}?format=${type}`; // type = 'pdf' or 'excel'
    try {
      const response = await apiFetch(url);
      if (!response.ok) throw new Error("Export failed");

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = type === "pdf" ? "trp_report.pdf" : "trp_report.xlsx";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      setToast({ message: 'Error exporting file: ' + error.message, type: 'error' })  
    }
  };

  return (
    <>
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
      <div className="app-page app-form space-y-6">
      <div className="app-card space-y-4">
          <h1 className="text-3xl font-bold">Management Page</h1>
          <div className="app-actions">
            <button
              onClick={() => handleExport("pdf")}
              className="app-button"
            >
              Export PDF
            </button>
            <button
              onClick={() => handleExport("excel")}
              className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 transition"
            >
              Export Excel
            </button>
          </div>
        </div>

        <button
          onClick={() => navigate("/dashboard")}
          className="app-button secondary"
        >
          Back to Dashboard
        </button>
      </div>
    </>
  );
}

export default Management;
