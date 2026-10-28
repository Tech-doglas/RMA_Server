import { apiFetch, API_SERVER } from '../common/access';
import React, { useState, useEffect } from 'react';
import { authApi } from '../common/access';
import { useNavigate } from 'react-router-dom';

function Register() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [department, setDepartment] = useState('');
  const [departments, setDepartments] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  useEffect(() => { authApi('/departments').then(data => { setDepartments(data.departments); if (data.departments.length === 1) setDepartment(data.departments[0]); }).catch(err => setError(err.message)); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setError('');
    setBusy(true);


    try {
      const response = await apiFetch(API_SERVER + '/auth/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password, department })
      });

      if (response.ok) {
        const data = await response.json();
        setNotice(data.message); setPassword('');
      } else {
        const data = await response.json();
        setError(data.error || 'Registration failed.');
      }
    } catch (err) {
      setError('Cannot reach the server. Check your connection and try again.');
    } finally { setBusy(false); }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="text-3xl font-bold text-center mb-6">Register</h1>
        <p className="text-sm text-gray-600 mb-4">An admin assigns your department and company access, then approves your account before login.</p>
        {notice && <p role="status" className="text-green-800 bg-green-50 p-3 mb-4">{notice}</p>}
        <form onSubmit={handleSubmit} aria-busy={busy}><fieldset disabled={!!notice || busy}>
          <label htmlFor="register-username">Username</label>
          <input id="register-username" required maxLength={255} autoComplete="username" className="mb-3 p-2 w-full border" placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} />
          <label htmlFor="register-password">Password</label>
          <input id="register-password" required minLength={12} maxLength={255} autoComplete="new-password" aria-describedby="password-help" className="mb-3 p-2 w-full border" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <p id="password-help" className="text-sm text-gray-600 mb-3">Use at least 12 characters. A few memorable words work well.</p>
          <label htmlFor="register-department">Department</label>
          <select
            id="register-department" required
            className="mb-3 p-2 w-full border"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
          >
            <option value="">Select Department</option>
            {departments.map(name => <option key={name}>{name}</option>)}
          </select>
          {error && <p role="alert" className="text-red-500 text-sm">{error}</p>}
          <button className="w-full bg-blue-600 text-white p-3 rounded-lg hover:bg-blue-700 transition-colors mb-2" type="submit" disabled={!departments.length}>{busy ? 'Submitting…' : 'Register'}</button>
          </fieldset>
          <button
            type="button"
            className="w-full bg-gray-600 text-white p-3 rounded-lg hover:bg-gray-700 transition-colors"
            onClick={() => navigate('/')}
          >
            Back To Login
          </button>
        </form>
      </div>
    </div>
  );
}

export default Register;
