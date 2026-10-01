import React from "react";
import { Link } from "react-router-dom";
import { canPermission } from './common/access';

function Dashboard({ role, department, onLogout }) {
  return (
    <div className="dashboard-page">
      <div>
        <h1 className="text-3xl font-bold text-gray-800 mb-8">
          RMA System Dashboard
        </h1>
        <p className="dashboard-intro">Choose PC / Non-PC inventory or 3PL returns.</p>
        <div className="dashboard-workspaces">
          {(canPermission('pc.view') || canPermission('nonpc.view')) && (
            <section className="app-card dashboard-workspace" aria-labelledby="inventory-heading">
              <h2 id="inventory-heading">PC / Non-PC</h2>
              <p>Manage devices, inventory, and sales.</p>
              <div className="app-actions">
                {canPermission('pc.view') && <Link className="app-button" to="/pc">PC inventory</Link>}
                {canPermission('nonpc.view') && <Link className="app-button secondary" to="/non-pc">Non-PC inventory</Link>}
              </div>
            </section>
          )}
          {canPermission('return.view') && <section className="app-card dashboard-workspace" aria-labelledby="third-party-heading">
            <h2 id="third-party-heading">3PL</h2>
            <p>Receive, inspect, palletize, and ship returned units.</p>
            <div className="app-actions">
              <Link className="app-button" to="/return">All returns</Link>
              {canPermission('return.receive') && <Link className="app-button secondary" to="/return/input">Receive delivery</Link>}
              {(canPermission('return.pallet_view') || canPermission('return.ship') || canPermission('return.pallet_status')) && <Link className="app-button secondary" to="/return/ship">{canPermission('return.ship') ? 'Ship out / pallets' : 'Pallets & shipments'}</Link>}
              {canPermission('return.report') && <Link className="app-button secondary" to="/return/report">Monthly report</Link>}
            </div>
          </section>}
        </div>
        <div className="app-actions dashboard-tools">
          {canPermission('pc.report') && (
            <Link className="app-button secondary" to="/manager-tools">Manager tools</Link>
          )}
          {role === 'admin' && <Link className="app-button secondary" to="/admin">Administration</Link>}
          <button
            onClick={onLogout}
            className="bg-gray-500 text-white px-4 py-2 rounded"
          >
            Logout
          </button>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
