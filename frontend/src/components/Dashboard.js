import React from 'react';
import { Link } from 'react-router-dom';

function Dashboard() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow-lg text-center">
        <h1 className="text-3xl font-bold text-gray-800 mb-8">RMA System Dashboard</h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link to="/pc">
            <button className="w-full bg-green-500 text-white p-4 rounded-lg hover:bg-green-600 transition-colors">
              PC
            </button>
          </Link>
          <Link to="/non-pc">
            <button className="w-full bg-blue-500 text-white p-4 rounded-lg hover:bg-blue-600 transition-colors">
              Non-PC
            </button>
          </Link>
          <Link to="/xie">
            <button className="w-full bg-purple-500 text-white p-4 rounded-lg hover:bg-purple-600 transition-colors">
              Xie
            </button>
          </Link>
          <Link to="/return-receiving">
            <button className="w-full bg-orange-500 text-white p-4 rounded-lg hover:bg-orange-600 transition-colors">
              Return Receiving
            </button>
          </Link>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;