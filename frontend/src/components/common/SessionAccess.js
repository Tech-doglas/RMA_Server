import React, { useEffect, useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { authApi, routeAllowed } from './access';

export default function SessionAccess({ authenticated, role, onSession, onInvalid, children }) {
  const { pathname } = useLocation();
  const [connectionError, setConnectionError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!authenticated) return;
    let active = true;
    const refresh = () => authApi('/session').then(data => { if (active) { setConnectionError(false); onSession(data); } }).catch(error => {
      if (!active) return;
      if (error.status === 401) { setConnectionError(false); onInvalid(); }
      else setConnectionError(true);
    });
    refresh();
    window.addEventListener('focus', refresh);
    const timer = setInterval(refresh, 60000);
    return () => { active = false; window.removeEventListener('focus', refresh); clearInterval(timer); };
  }, [pathname, authenticated, onSession, onInvalid, retry]);
  if (authenticated && !routeAllowed(pathname, role)) return <section className="app-card"><h1>Access unavailable</h1><p className="mt-4 mb-4">Your department does not have permission to use this page. Contact an admin.</p><Link className="app-button" to="/dashboard">Back to dashboard</Link></section>;
  return <>{authenticated && connectionError && <div className="app-card mb-4" role="alert">Cannot reach the server to refresh your session. Check your connection. <button className="app-button secondary" onClick={() => setRetry(value => value + 1)}>Retry connection</button></div>}{children}</>;
}
