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
        <p className="dashboard-intro">Manage PC / Non-PC inventory or handle returns for other companies.</p>
        <div className="dashboard-workspaces">
          {(canPermission('pc.view') || canPermission('nonpc.view')) && (
            <section className="app-card dashboard-workspace" aria-labelledby="inventory-heading">
              <h2 id="inventory-heading">PC / Non-PC</h2>
              <p>Manage devices, inventory, and sales.</p>
              <div className="app-actions">
                {canPermission('pc.view') && <Link className="app-button" to="/pc">PC inventory</Link>}
                {canPermission('nonpc.view') && <Link className="app-button" to="/non-pc">Non-PC inventory</Link>}
              </div>
            </section>
          )}
          {canPermission('return.view') && <section className="app-card dashboard-workspace" aria-labelledby="third-party-heading">
            <h2 id="third-party-heading">Third-party logistics (3PL)</h2>
            <p>Manage returns for other companies: receive, inspect, palletize, and ship their units.</p>
            <div className="app-actions">
              <Link className="app-button" to="/return">All returns</Link>
              {canPermission('return.receive') && <Link className="app-button" to="/return/input">Receive delivery</Link>}
              {(canPermission('return.pallet_view') || canPermission('return.ship') || canPermission('return.pallet_status')) && <Link className="app-button" to="/return/ship">{canPermission('return.ship') ? 'Ship out / pallets' : 'Pallets & shipments'}</Link>}
              {canPermission('return.report') && <Link className="app-button" to="/return/report">Monthly report</Link>}
            </div>
          </section>}
        </div>
        <div className="app-actions dashboard-tools">
          {canPermission('pc.report') && (
            <Link className="app-button" to="/manager-tools">Manager tools</Link>
          )}
          {role === 'admin' && <Link className="app-button" to="/admin">Administration</Link>}
          <button
            onClick={onLogout}
            className="app-button"
          >
            Logout
          </button>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
