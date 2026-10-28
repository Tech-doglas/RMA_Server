import React, { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { canPermission } from './access';

export default function AppAreaSwitcher({ role }) {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const container = useRef(null);
  const trigger = useRef(null);
  const area = pathname.startsWith('/return') ? '3PL'
    : pathname.startsWith('/non-pc') ? 'Non-PC'
      : pathname.startsWith('/pc') ? 'PC inventory'
        : pathname.startsWith('/admin') ? 'Admin'
          : pathname.startsWith('/manager-tools') ? 'Reports'
            : pathname.startsWith('/xie') ? 'XIE' : 'Dashboard';

  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const closeOutside = event => {
      if (!container.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = event => {
      if (event.key === 'Escape') {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  return <div className="app-area-switcher" ref={container} onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }}>
    <button type="button" className="app-area-trigger" ref={trigger}
      aria-label={'Switch area, current area: ' + area}
      aria-expanded={open} aria-controls="app-area-navigation" onClick={() => setOpen(value => !value)}>
      <span><small>Switch area</small><strong>{area}</strong></span>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
    </button>
    {open && <nav id="app-area-navigation" className="app-area-menu" aria-label="Main navigation" onClick={event => {
      if (event.target.closest('a')) setOpen(false);
    }}>
      <NavLink to="/dashboard">Dashboard</NavLink>
      {canPermission('return.view') && <NavLink to="/return">Third-party logistics (3PL)</NavLink>}
      {canPermission('pc.view') && <NavLink to="/pc">PC inventory</NavLink>}
      {canPermission('nonpc.view') && <NavLink to="/non-pc">Non-PC</NavLink>}
      {canPermission('pc.report') && <NavLink to="/manager-tools">Reports</NavLink>}
      {role === 'admin' && <NavLink to="/admin">Admin</NavLink>}
    </nav>}
  </div>;
}
