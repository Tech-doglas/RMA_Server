import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

function Login({ onLogin, onLogout }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
  
    try {
      const response = await fetch('http://127.0.0.1:8088/auth/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
  
      const data = await response.json();
  
      if (response.ok) {
        onLogin(data.role, data.department);
        navigate('/dashboard');
      } else {
        setError(data.error || 'Login failed.');
      }
    } catch (err) {
      console.log(err);
      setError('Server error. Please try again later.');
    }
  };
  

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow-lg w-full max-w-md">
        <h1 className="text-3xl font-bold text-center text-gray-800 mb-6">RMA System Login</h1>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-gray-700 font-bold mb-2" htmlFor="username">
              Username
            </label>
            <input
              type="text"
              id="username"
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
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              placeholder="Enter your password"
            />
          </div>
          {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
          <button
            type="submit"
            className="w-full bg-blue-600 text-white p-3 rounded-lg hover:bg-blue-700 transition-colors mb-2"
          >
            Login
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