import React from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import './appTheme.css';
import { canPermission } from './access';

export default function AppFrame({ authenticated, role, department, onLogout, children }) {
  const { pathname } = useLocation();
  const authPage = pathname === '/' || pathname === '/register';
  return <div className="app-frame">
    <header className="app-header"><div className="app-header-inner">
      <Link className="app-brand" to={authenticated ? '/dashboard' : '/'}>SNOWBELL <span>RMA</span><small>Receiving and inventory</small></Link>
      {authenticated && !authPage ? <><nav aria-label="Main navigation">
        <NavLink to="/dashboard">Dashboard</NavLink>{canPermission('return.view') && <NavLink to="/return">3PL</NavLink>}
        {canPermission('pc.view') && <NavLink to="/pc">PC inventory</NavLink>}{canPermission('nonpc.view') && <NavLink to="/non-pc">Non-PC</NavLink>}
        {canPermission('pc.report') && <NavLink to="/manager-tools">Reports</NavLink>}
        {role === 'admin' && <NavLink to="/admin">Admin</NavLink>}
      </nav><Link className="app-signout" to="/" onClick={onLogout}>Log out</Link></> : <nav aria-label="Account navigation"><NavLink end to="/">Login</NavLink><NavLink to="/register">Register</NavLink></nav>}
    </div></header>
    <div className={'app-workspace' + (authPage ? ' app-auth' : '')}>{children}</div>
  </div>;
}
