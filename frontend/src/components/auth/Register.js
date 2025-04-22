import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

function Register() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [invitationCode, setInvitationCode] = useState('');
  const [department, setDepartment] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const role = invitationCode === 'doglas10th' ? 'manager' : 'normal';

    try {
      const response = await fetch('http://127.0.0.1:8088/auth/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, role, department })
      });

      if (response.ok) {
        navigate('/');
      } else {
        const data = await response.json();
        setError(data.error || 'Registration failed.');
      }
    } catch (err) {
      setError('Server error.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow-lg w-full max-w-md">
        <h1 className="text-3xl font-bold text-center mb-6">Register</h1>
        <form onSubmit={handleSubmit}>
          <input className="mb-3 p-2 w-full border" placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} />
          <input className="mb-3 p-2 w-full border" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <select
            className="mb-3 p-2 w-full border"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
          >
            <option value="">Select Department</option>
            <option value="Tech">Tech</option>
            <option value="Xie">Xie</option>
            <option value="IT">IT</option>
            <option value="Accounting">Accounting</option>
            <option value="Sale">Sale</option>
          </select>
          <input className="mb-3 p-2 w-full border" placeholder="Invitation Code" value={invitationCode} onChange={(e) => setInvitationCode(e.target.value)} />
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button className="w-full bg-blue-600 text-white p-3 rounded-lg hover:bg-blue-700 transition-colors mb-2" type="submit">Register</button>
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
