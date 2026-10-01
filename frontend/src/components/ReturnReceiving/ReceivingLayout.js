import React from 'react';
import { NavLink } from 'react-router-dom';
import { statusOf } from './receivingApi';
import './receiving.css';
import { canPermission } from '../common/access';
export default function ReceivingLayout({ title, subtitle, primaryAction, children }) {
  return <main className="receiving">
    <nav aria-label="Receiving navigation">
      {canPermission('return.view') && <NavLink end to="/return">Returns</NavLink>}
      {(canPermission('return.pallet_view') || canPermission('return.ship') || canPermission('return.pallet_status')) && <NavLink to="/return/ship">{canPermission('return.ship') ? 'Ship out' : 'Pallets & shipments'}</NavLink>}
      {canPermission('return.report') && <NavLink to="/return/report">Monthly report</NavLink>}
      {canPermission('legacy.view') && <NavLink end to="/return/legacy">Previous records</NavLink>}
      {['return.edit', 'return.delete', 'return.inspect', 'return.classify', 'return.restore', 'return.export'].some(canPermission) && <NavLink to="/return/manage">Manage records</NavLink>}
      {canPermission('admin') && <NavLink to="/return/settings">Types & companies</NavLink>}
    </nav>
    <div className="receiving-title receiving-title-row"><div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>{primaryAction}</div>{children}
  </main>;
}
export function ErrorMessage({ message }) {
  return message ? <div className="receiving-error" role="alert">{message}</div> : null;
}
export function Status({ item }) {
  return <span className={`receiving-status ${item.shipDate ? 'shipped' : item.inspectionDate ? 'inspected' : 'pending'}`}>{statusOf(item)}</span>;
}
export function InspectionStatus({ item }) {
  return <span className={'receiving-status ' + (item.inspectionDate ? 'inspected' : 'pending')}>{item.inspectionDate ? 'Inspected' : 'Awaiting inspection'}</span>;
}
export function ShippingStatus({ item }) {
  return <span className={'receiving-status ' + (item.shipDate ? 'shipped' : item.inspectionDate ? 'inspected' : 'pending')}>{item.shipDate ? 'Shipped' : item.inspectionDate ? 'Ready to ship' : 'Not ready'}</span>;
}
