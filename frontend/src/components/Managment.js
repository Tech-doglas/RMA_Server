import React, {useState} from 'react';
import { useNavigate } from 'react-router-dom';
import Toast from './common/Toast';

function Management() {
  const navigate = useNavigate();
  const [toast, setToast] = useState(null);

  const handleExport = async (type) => {
    setToast({ message: 'function not finished yet, Give me some times Please!!', type: 'error' })
    // const url = type === 'pdf' ? `http://${window.location.hostname}:8088/report/laptop_TRP` : '/api/laptop_TRP_excel'; 
    // try {
    //   const response = await fetch(url);
    //   if (!response.ok) throw new Error('Export failed');
  
    //   const blob = await response.blob();
    //   const downloadUrl = window.URL.createObjectURL(blob);
    //   const link = document.createElement('a');
    //   link.href = downloadUrl;
    //   link.download = type === 'pdf' ? 'trp_report.pdf' : 'trp_report.xlsx'; 
    //   document.body.appendChild(link);
    //   link.click();
    //   link.remove();
    //   window.URL.revokeObjectURL(downloadUrl);
    // } catch (error) {
    //   alert('Error exporting file: ' + error.message);
    // }
    
  };

  return (
    <>
    {toast && <Toast {...toast} onClose={() => setToast(null)} />}
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Management Page</h1>
        <div className="space-x-2">
        <button
            onClick={() => handleExport('pdf')}
            className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600 transition"
          >
            Export PDF
          </button>
          <button
            onClick={() => handleExport('excel')}
            className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 transition"
          >
            Export Excel
          </button>
        </div>
      </div>

      <button
        onClick={() => navigate('/dashboard')}
        className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition"
      >
        Back to Dashboard
      </button>
    </div>
    </>
  );
}

export default Management;
