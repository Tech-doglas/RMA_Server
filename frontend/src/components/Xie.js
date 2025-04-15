import React from 'react';
import { useNavigate } from 'react-router-dom';

function Xie() {
  const navigate = useNavigate();

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Xie Page</h1>
      <p className="text-gray-500 mb-4">This is a placeholder for the Xie page.</p>
      <button
        onClick={() => navigate('/dashboard')}
        className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
      >
        Back to Dashboard
      </button>
    </div>
  );
}

export default Xie;