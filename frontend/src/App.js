import React, { useState, useEffect } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import "./index.css";
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

  const handleLogin = (role, dept) => {
    setIsAuthenticated(true);
    setUserRole(role);
    setDepartment(dept);
    localStorage.setItem(
      "auth",
      JSON.stringify({
        isAuthenticated: true,
        role,
        department: dept,
      })
    );
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setUserRole("");
    setDepartment("");
    localStorage.removeItem("auth");
  };

  useEffect(() => {
    const savedAuth = localStorage.getItem("auth");
    if (savedAuth) {
      const parsed = JSON.parse(savedAuth);
      setIsAuthenticated(parsed.isAuthenticated);
      setUserRole(parsed.role);
      setDepartment(parsed.department);
    }
    setAuthChecked(true);
  }, []);

  return (
    <Router>
      <div className="min-h-screen bg-gray-100">
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
              element={isAuthenticated ? <LaptopInput /> : <Navigate to="/" />}
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
              path="/non-pc/:id/sales"
              element={isAuthenticated ? <NonPCSales/> : <Navigate to="/" />}
            />
            <Route
              path="/non-pc/:id/edit"
              element={isAuthenticated ? <NonPCEdit /> : <Navigate to="/" />}
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
                isAuthenticated ? <ReturnReceivingInput /> : <Navigate to="/" />
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
            <Route
              path="/xie"
              element={isAuthenticated ? <XieList department={department}/> : <Navigate to="/" />}
            />
            <Route
              path="/xie/input"
              element={isAuthenticated ? <XieInput /> : <Navigate to="/" />}
            />
            <Route path="/xie-list/:trackingNumber" element={isAuthenticated ? <XieDetails /> : <Navigate to="/" />} />
            <Route path="/xie/request" element={isAuthenticated ? <XieRequest /> : <Navigate to="/" />} />
            <Route
              path="/manager-tools"
              element={
                isAuthenticated && userRole === "manager" ? (
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
      </div>
    </Router>
  );
}

export default App;
