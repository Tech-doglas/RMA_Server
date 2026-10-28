import React from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import './appTheme.css';
import AppAreaSwitcher from './AppAreaSwitcher';

export default function AppFrame({ authenticated, role, department, onLogout, children }) {
  const { pathname } = useLocation();
  const authPage = pathname === '/' || pathname === '/register';
  return <div className="app-frame">
    <header className="app-header"><div className="app-header-inner">
      <Link className="app-brand" to={authenticated ? '/dashboard' : '/'}>RMA system</Link>
      {authenticated && !authPage ? <><AppAreaSwitcher role={role} /><Link className="app-signout" to="/" onClick={onLogout}>Log out</Link></> : <nav aria-label="Account navigation"><NavLink end to="/">Login</NavLink><NavLink to="/register">Register</NavLink></nav>}
    </div></header>
    <div className={'app-workspace' + (authPage ? ' app-auth' : '')}>{children}</div>
  </div>;
}
