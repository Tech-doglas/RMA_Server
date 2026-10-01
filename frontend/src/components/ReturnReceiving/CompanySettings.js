import React, { useEffect, useState } from 'react';
import { ErrorMessage } from './ReceivingLayout';
import { receivingApi } from './receivingApi';

function CompanyRow({ name, options, busy, update }) {
  const [replacement, setReplacement] = useState(name);
  const [removing, setRemoving] = useState(false);
  const [fallback, setFallback] = useState('');
  return <div className="receiving-unit"><h3>{name}</h3>
    <form onSubmit={e => { e.preventDefault(); update('PATCH', { name, replacement }); }}><fieldset disabled={busy}>
      <label>Rename {name}<input required maxLength={255} value={replacement} onChange={e => setReplacement(e.target.value)} /></label>
      <div className="receiving-actions"><button type="submit">Rename company</button><button type="button" className="secondary" onClick={() => setRemoving(!removing)}>{removing ? 'Cancel removal' : 'Remove company'}</button></div>
    </fieldset></form>
    {removing && <form onSubmit={e => { e.preventDefault(); update('DELETE', { name, replacement: fallback }); }}><fieldset disabled={busy}>
      <p className="receiving-muted mt-5 mb-4">Existing returns using {name} will move to your chosen replacement.</p>
      <label>Replacement for {name}<select value={fallback} onChange={e => setFallback(e.target.value)}><option value="">Unspecified</option>{options.filter(option => option !== name).map(option => <option key={option}>{option}</option>)}</select></label>
      <div className="receiving-actions"><button className="danger" type="submit">Confirm remove company</button></div>
    </fieldset></form>}
  </div>;
}

export default function CompanySettings() {
  const [options, setOptions] = useState([]);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    let active = true;
    receivingApi('/admin/companies').then(data => { if (active) setOptions(data.companies); })
      .catch(err => { if (active) setError(err.message); }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, []);
  async function update(method, payload) {
    setBusy(true); setError(''); setNotice('');
    try {
      const data = await receivingApi('/admin/companies', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      setOptions(data.companies); setName(''); setNotice(data.message);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return <><ErrorMessage message={error} />{notice && <div className="receiving-success" role="status">{notice}</div>}
    <section className="receiving-card"><h2>Company options</h2><p className="receiving-muted mb-4">Only admins can manage these options. Renaming or removing a company updates existing 3PL records too.</p>
      <form onSubmit={e => { e.preventDefault(); update('POST', { name }); }}><fieldset disabled={busy}><label>New company<input required maxLength={255} value={name} onChange={e => setName(e.target.value)} /></label><div className="receiving-actions"><button type="submit">Add company</button></div></fieldset></form>
      {options.map(option => <CompanyRow key={option} name={option} options={options} busy={busy} update={update} />)}
      {!busy && !options.length && <p className="receiving-muted mt-5">No company options. New deliveries can use Unspecified.</p>}
    </section></>;
}
