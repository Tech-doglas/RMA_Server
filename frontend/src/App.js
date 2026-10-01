import React, { useState, useEffect, useCallback } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import "./index.css";
import AppFrame from './components/common/AppFrame';
import SessionAccess from './components/common/SessionAccess';
import { apiFetch, API_SERVER, canPermission } from './components/common/access';
import Login from "./components/auth/Login";
import Register from "./components/auth/Register";
import Dashboard from "./components/Dashboard";
import LaptopList from "./components/laptop/LaptopList";
import LaptopInput from "./components/laptop/LaptopInput";
import LaptopDetails from "./components/laptop/LaptopDetails";
import LaptopSales from "./components/laptop/LaptopSales";
import LaptopEdit from "./components/laptop/LaptopEdit";
import NonPCList from "./components/nonLaptop/NonPCList";
import NonPCInput from "./components/nonLaptop/NonPCInput";
import NonPCDetails from "./components/nonLaptop/NonPCDetails";
import NonPCSales from "./components/nonLaptop/NonPCSales";
import NonPCEdit from "./components/nonLaptop/NonPCEdit";
import ReturnReceivingList from "./components/ReturnReceiving/ReturnReceivingList";
import ReturnReceivingInput from "./components/ReturnReceiving/ReturnReceivingInput";
import ReturnReceivingDetails from "./components/ReturnReceiving/ReturnReceivingDetails";
import ReturnReceivingEdit from "./components/ReturnReceiving/ReturnReceivingEdit";
import ReturnReceivingShip from "./components/ReturnReceiving/ReturnReceivingShip";
import ReturnReceivingReport from "./components/ReturnReceiving/ReturnReceivingReport";
import ReturnReceivingAdmin, { ReturnReceivingManage } from "./components/ReturnReceiving/ReturnReceivingAdminConsole";
import ReturnReceivingAdminEdit from "./components/ReturnReceiving/ReturnReceivingAdminEdit";
import ReturnReceivingSettings from "./components/ReturnReceiving/ReturnReceivingSettings";
import LegacyReceivingList from "./components/ReturnReceiving/LegacyReceivingList";
import LegacyReceivingDetails from "./components/ReturnReceiving/LegacyReceivingDetails";
import XieList from "./components/Xie/XieList";
import XieInput from "./components/Xie/XieInput";
import XieDetails from './components/Xie/XieDetails';
import XieRequest from './components/Xie/XieRequest';
import Managment from "./components/Managment";

import { ClipLoader } from "react-spinners";

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userRole, setUserRole] = useState(null);
  const [department, setDepartment] = useState("");
  const [authChecked, setAuthChecked] = useState(false);
  const [, setAccessRevision] = useState(0);

  const handleLogin = (role, dept, username, token, permissions = []) => {
    setIsAuthenticated(true);
    setUserRole(role);
    setDepartment(dept);
    localStorage.setItem(
      "auth",
      JSON.stringify({
        isAuthenticated: true,
        role,
        department: dept,
        username,
        permissions,
      })
    );
  };

  const handleLogout = useCallback(() => {
    apiFetch(API_SERVER + '/auth/api/logout', { method: 'POST' }).catch(() => {});
    setIsAuthenticated(false);
    setUserRole("");
    setDepartment("");
    localStorage.removeItem("auth");
    Object.keys(sessionStorage).filter(key => key.startsWith('list-view:')).forEach(key => sessionStorage.removeItem(key));
  }, []);
  const handleSession = useCallback(data => {
    let previous;
    try { previous = JSON.parse(localStorage.getItem('auth') || '{}') || {}; } catch { previous = {}; }
    const next = { ...previous, ...data, isAuthenticated: true };
    delete next.token;
    if (JSON.stringify(previous) === JSON.stringify(next)) return;
    localStorage.setItem('auth', JSON.stringify(next));
    setUserRole(data.role); setDepartment(data.department); setAccessRevision(value => value + 1);
  }, []);

  useEffect(() => {
    const savedAuth = localStorage.getItem("auth");
    if (savedAuth) {
      try {
        const parsed = JSON.parse(savedAuth);
        setIsAuthenticated(!!parsed?.isAuthenticated);
        setUserRole(parsed?.role);
        setDepartment(parsed?.department);
      } catch { localStorage.removeItem('auth'); }
    }
    setAuthChecked(true);
  }, []);

  return (
    <Router>
      <AppFrame authenticated={isAuthenticated} role={userRole} department={department} onLogout={handleLogout}>
        <SessionAccess authenticated={isAuthenticated} role={userRole} onSession={handleSession} onInvalid={handleLogout}>
        {authChecked ? (
          <Routes>
            <Route path="/" element={<Login onLogin={handleLogin} />} />
            <Route path="/register" element={<Register />} />
            <Route
              path="/dashboard"
              element={
                isAuthenticated ? (
                  <Dashboard
                    role={userRole}
                    department={department}
                    onLogout={handleLogout}
                  />
                ) : (
                  <Navigate to="/" />
                )
              }
            />
            <Route
              path="/pc"
              element={isAuthenticated ? <LaptopList /> : <Navigate to="/" />}
            />
            <Route
              path="/pc/input"
              element={isAuthenticated ? <LaptopInput handleLogout={handleLogout}/> : <Navigate to="/" />}
            />
            <Route
              path="/pc/:id"
              element={
                isAuthenticated ? <LaptopDetails /> : <Navigate to="/" />
              }
            />
            <Route
              path="/pc/:id/sales"
              element={isAuthenticated ? <LaptopSales /> : <Navigate to="/" />}
            />
            <Route
              path="/pc/:id/edit"
              element={isAuthenticated ? <LaptopEdit handleLogout={handleLogout}/> : <Navigate to="/" />}
            />
            <Route
              path="/non-pc"
              element={isAuthenticated ? <NonPCList /> : <Navigate to="/" />}
            />
            <Route
              path="/non-pc/input"
              element={isAuthenticated ? <NonPCInput handleLogout={handleLogout}/> : <Navigate to="/" />}
            />
            <Route
              path="/non-pc/:id"
              element={isAuthenticated ? <NonPCDetails /> : <Navigate to="/" />}
            />
            <Route
              path="/non-pc/:id/sales"
              element={isAuthenticated ? <NonPCSales/> : <Navigate to="/" />}
            />
            <Route
              path="/non-pc/:id/edit"
              element={isAuthenticated ? <NonPCEdit handleLogout={handleLogout}/> : <Navigate to="/" />}
            />
            <Route
              path="/return"
              element={
                isAuthenticated ? <ReturnReceivingList department={department} /> : <Navigate to="/" />
              }
            />
            <Route
              path="/return/edit/:id"
              element={
                isAuthenticated ? <ReturnReceivingEdit /> : <Navigate to="/" />
              }
            />
            <Route
              path="/return/input"
              element={
                isAuthenticated ? <ReturnReceivingInput department={department} /> : <Navigate to="/" />
              }
            />
            <Route
              path="/return/:id"
              element={
                isAuthenticated ? (
                  <ReturnReceivingDetails />
                ) : (
                  <Navigate to="/" />
                )
              }
            />
            <Route path="/return/ship" element={isAuthenticated ? <ReturnReceivingShip /> : <Navigate to="/" />} />
            <Route path="/return/report" element={isAuthenticated ? <ReturnReceivingReport /> : <Navigate to="/" />} />
            <Route path="/admin" element={isAuthenticated && userRole === 'admin' ? <ReturnReceivingAdmin /> : <Navigate to="/" />} />
            <Route path="/return/admin" element={isAuthenticated && userRole === 'admin' ? <Navigate replace to="/admin" /> : <Navigate to="/" />} />
            <Route path="/return/manage" element={isAuthenticated ? <ReturnReceivingManage /> : <Navigate to="/" />} />
            <Route path="/return/settings" element={isAuthenticated && userRole === 'admin' ? <ReturnReceivingSettings /> : <Navigate to="/dashboard" />} />
            <Route path="/return/admin/:id" element={isAuthenticated && (canPermission('return.edit') || canPermission('return.delete')) ? <ReturnReceivingAdminEdit /> : <Navigate to="/dashboard" />} />
            <Route path="/return/legacy" element={isAuthenticated ? <LegacyReceivingList department={department} /> : <Navigate to="/" />} />
            <Route path="/return/legacy/:id" element={isAuthenticated ? <LegacyReceivingDetails /> : <Navigate to="/" />} />
            <Route
              path="/xie"
              element={isAuthenticated ? <XieList department={department}/> : <Navigate to="/" />}
            />
            <Route
              path="/xie/input"
              element={isAuthenticated ? <XieInput handleLogout={handleLogout}/> : <Navigate to="/" />}
            />
            <Route path="/xie-list/:trackingNumber" element={isAuthenticated ? <XieDetails /> : <Navigate to="/" />} />
            <Route path="/xie/request" element={isAuthenticated ? <XieRequest /> : <Navigate to="/" />} />
            <Route
              path="/manager-tools"
              element={
                isAuthenticated && canPermission('pc.report') ? (
                  <Managment department={department}/>
                ) : (
                  <Navigate to="/" />
                )
              }
            />
          </Routes>
        ) : (
          <div className="p-6 flex justify-center items-center">
            <ClipLoader color="#4B5563" size={40} />
          </div>
        )}
        </SessionAccess>
      </AppFrame>
    </Router>
  );
}

export default App;
