import React, { useEffect, useState } from 'react';
import { SuccessMessage, ErrorMessage } from './ReceivingLayout';
import { receivingApi } from './receivingApi';

function TypeRow({ name, options, busy, update }) {
  const [replacement, setReplacement] = useState(name);
  const [removing, setRemoving] = useState(false);
  const [fallback, setFallback] = useState('REGULAR');
  return <div className="receiving-unit"><h3>{name}</h3>{name === 'REGULAR' ? <p className="receiving-muted">Default for new units. This option must remain available.</p> : <>
    <form onSubmit={e => { e.preventDefault(); update('PATCH', { name, replacement }); }}><fieldset disabled={busy}>
      <label>Rename {name}<input value={replacement} onChange={e => setReplacement(e.target.value)} required maxLength={255} /></label>
      <div className="receiving-actions"><button type="submit">Rename</button><button type="button" className="secondary" onClick={() => setRemoving(!removing)}>{removing ? 'Cancel removal' : 'Remove type'}</button></div>
    </fieldset></form>
    {removing && <form onSubmit={e => { e.preventDefault(); update('DELETE', { name, replacement: fallback }); }}><fieldset disabled={busy}>
      <p className="receiving-muted mt-5 mb-4">Every return using {name} will move to the replacement type.</p>
      <label>Replacement for {name}<select value={fallback} onChange={e => setFallback(e.target.value)}>{options.filter(type => type !== name).map(type => <option key={type}>{type}</option>)}</select></label>
      <div className="receiving-actions"><button className="danger" type="submit">Confirm remove type</button></div>
    </fieldset></form>}
  </>}</div>;
}

export default function ReturnReceivingAdmin() {
  const [options, setOptions] = useState([]);
  const [newType, setNewType] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => { receivingApi('/admin/types').then(data => setOptions(data.bulkTypes)).catch(err => setError(err.message)); }, []);
  async function update(method, payload) {
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await receivingApi('/admin/types', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      setOptions(result.bulkTypes); setNewType(''); setNotice(result.message);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return <div>
    <ErrorMessage message={error} onClose={() => setError('')} /><SuccessMessage message={notice} onClose={() => setNotice('')} />
    <section className="receiving-card"><h2>Bulk type options</h2><p className="receiving-muted mb-4">Changes apply to older records too. Staff can choose these types; only admins can manage the options.</p>
      <form onSubmit={e => { e.preventDefault(); update('POST', { name: newType }); }}><fieldset disabled={busy}><label>New type<input required maxLength={255} value={newType} onChange={e => setNewType(e.target.value)} /></label><div className="receiving-actions"><button type="submit">Add type</button></div></fieldset></form>
      {options.map(name => <TypeRow key={name} name={name} options={options} busy={busy} update={update} />)}
    </section>
  </div>;
}
