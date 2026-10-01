import React, { useState } from 'react';
import { ErrorMessage } from './ReceivingLayout';
import { receivingApi } from './receivingApi';

export default function AdminPasswordSettings() {
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function changePassword(event) {
    event.preventDefault(); setError(''); setBusy(true);
    try {
      await receivingApi('/admin/password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(passwords) });
      localStorage.removeItem('auth'); window.location.assign('/');
    } catch (err) { setError(err.message); setBusy(false); }
  }
  return <section className="receiving-card"><h2>Change your admin password</h2><ErrorMessage message={error} />
    <form onSubmit={changePassword}><fieldset disabled={busy}><div className="receiving-grid">
      <label>Current password<input type="password" autoComplete="current-password" required value={passwords.currentPassword} onChange={event => setPasswords({ ...passwords, currentPassword: event.target.value })} /></label>
      <label>New password<input type="password" autoComplete="new-password" required minLength={12} maxLength={255} value={passwords.newPassword} onChange={event => setPasswords({ ...passwords, newPassword: event.target.value })} /></label>
    </div><p className="receiving-muted mt-5">Use at least 12 characters. You will log in again after changing it.</p><div className="receiving-actions"><button type="submit">{busy ? 'Changing password…' : 'Change password'}</button></div></fieldset></form>
  </section>;
}
