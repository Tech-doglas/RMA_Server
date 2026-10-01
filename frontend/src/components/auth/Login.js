import { apiFetch, API_SERVER } from '../common/access';
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

function Login({ onLogin, onLogout }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setError('');
    setBusy(true);
  
    try {
      const response = await apiFetch(API_SERVER + '/auth/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password })
      });
  
      const data = await response.json().catch(() => ({ error: 'Unable to log in. Please try again.' }));
  
      if (response.ok) {
        onLogin(data.role, data.department, data.username, data.token, data.permissions);
        navigate('/dashboard');
      } else {
        setError(data.error || 'Login failed.');
      }
    } catch (err) {
      setError('Cannot reach the server. Check your connection and try again.');
    } finally { setBusy(false); }
  };
  

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="text-3xl font-bold text-center text-gray-800 mb-6">RMA System Login</h1>
        <form onSubmit={handleSubmit} aria-busy={busy}>
          <div className="mb-4">
            <label className="block text-gray-700 font-bold mb-2" htmlFor="username">
              Username
            </label>
            <input
              type="text"
              id="username"
              required autoComplete="username" maxLength={255} disabled={busy}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              placeholder="Enter your username"
            />
          </div>
          <div className="mb-6">
            <label className="block text-gray-700 font-bold mb-2" htmlFor="password">
              Password
            </label>
            <input
              type={showPassword ? 'text' : 'password'}
              id="password"
              required autoComplete="current-password" maxLength={255} disabled={busy}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              placeholder="Enter your password"
            />
          </div>
          <label className="flex items-center gap-2 mb-4"><input type="checkbox" checked={showPassword} onChange={event => setShowPassword(event.target.checked)} />Show password</label>
          {error && <p role="alert" className="text-red-500 text-sm mb-4">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full bg-blue-600 text-white p-3 rounded-lg hover:bg-blue-700 transition-colors mb-2"
          >
            {busy ? 'Signing in…' : 'Login'}
          </button>
          <button
            type="button"
            className="w-full bg-gray-600 text-white p-3 rounded-lg hover:bg-gray-700 transition-colors"
            onClick={() => navigate('/register')}
          >
            Register
          </button>
        </form>
      </div>
    </div>
  );
}

export default Login;
