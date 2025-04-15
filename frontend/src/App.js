import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import './index.css';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import LaptopList from './components/LaptopList';
import LaptopInput from './components/LaptopInput';
import LaptopDetails from './components/LaptopDetails';
import LaptopSales from './components/LaptopSales';
import LaptopEdit from './components/LaptopEdit';
import NonPCList from './components/NonPCList';
import NonPCInput from './components/NonPCInput';
import NonPCDetails from './components/NonPCDetails';
import NonPCEdit from './components/NonPCEdit';
import ReturnReceivingList from './components/ReturnReceivingList';
import ReturnReceivingInput from './components/ReturnReceivingInput';
import ReturnReceivingDetails from './components/ReturnReceivingDetails';
import Xie from './components/Xie';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const handleLogin = () => {
    setIsAuthenticated(true);
  };

  return (
    <Router>
      <div className="min-h-screen bg-gray-100">
        <Routes>
          <Route path="/" element={<Login onLogin={handleLogin} />} />
          <Route
            path="/dashboard"
            element={isAuthenticated ? <Dashboard /> : <Navigate to="/" />}
          />
          <Route
            path="/pc"
            element={isAuthenticated ? <LaptopList /> : <Navigate to="/" />}
          />
          <Route
            path="/pc/input"
            element={isAuthenticated ? <LaptopInput /> : <Navigate to="/" />}
          />
          <Route
            path="/pc/:id"
            element={isAuthenticated ? <LaptopDetails /> : <Navigate to="/" />}
          />
          <Route
            path="/pc/:id/sales"
            element={isAuthenticated ? <LaptopSales /> : <Navigate to="/" />}
          />
          <Route
            path="/pc/:id/edit"
            element={isAuthenticated ? <LaptopEdit /> : <Navigate to="/" />}
          />
          <Route
            path="/non-pc"
            element={isAuthenticated ? <NonPCList /> : <Navigate to="/" />}
          />
          <Route
            path="/non-pc/input"
            element={isAuthenticated ? <NonPCInput /> : <Navigate to="/" />}
          />
          <Route
            path="/non-pc/:id"
            element={isAuthenticated ? <NonPCDetails /> : <Navigate to="/" />}
          />
          <Route
            path="/non-pc/:id/edit"
            element={isAuthenticated ? <NonPCEdit /> : <Navigate to="/" />}
          />
          <Route
            path="/return-receiving"
            element={isAuthenticated ? <ReturnReceivingList /> : <Navigate to="/" />}
          />
          <Route
            path="/return-receiving/input"
            element={isAuthenticated ? <ReturnReceivingInput /> : <Navigate to="/" />}
          />
          <Route
            path="/return-receiving/:id"
            element={isAuthenticated ? <ReturnReceivingDetails /> : <Navigate to="/" />}
          />
          <Route
            path="/xie"
            element={isAuthenticated ? <Xie /> : <Navigate to="/" />}
          />
        </Routes>
      </div>
    </Router>
  );
}

export default App;