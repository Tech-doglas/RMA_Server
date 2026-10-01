import { canPermission } from '../common/access';
import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { RecordLink as Link, BackToListing, listOrigin } from '../common/listNavigation';
import ReceivingLayout, { ErrorMessage } from './ReceivingLayout';
import { receivingApi } from './receivingApi';
import PalletField from './PalletField';

const fields = [
  ['tracking', 'Tracking number'], ['laptop', 'Laptop name'], ['company', 'Company'],
  ['receivedDate', 'Received date', 'date'], ['inspectionDate', 'Inspection date', 'date'],
  ['serial', 'Serial number'], ['pallet', 'Pallet'], ['shipDate', 'Ship date', 'date'],
];
export default function ReturnReceivingAdminEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [item, setItem] = useState(null);
  const [form, setForm] = useState({});
  const [types, setTypes] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [pallets, setPallets] = useState([]);
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    receivingApi('/units/' + encodeURIComponent(id)).then(data => {
      if (!active) return;
      setItem(data.item); setTypes(data.bulkTypes);
      setCompanies(data.companies || []);
      setPallets(data.availablePallets || []);
      setForm(Object.fromEntries([...fields.map(([field]) => field), 'remark', 'inspectionRemark', 'bulkType'].map(field => [field, data.item[field] || ''])));
    }).catch(err => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [id]);
  async function submit(e, remove = false) {
    e.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      const result = await receivingApi('/admin/units/' + encodeURIComponent(id), { method: remove ? 'DELETE' : 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(remove ? { confirmFileNo: confirmation } : form) });
      if (remove) navigate(listOrigin(location, '/return/manage'));
      else setNotice(result.message);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return <ReceivingLayout title={item ? 'Manage ' + item.fileNo : 'Manage return'} subtitle="Edit one unit or remove its record">
    <div className="receiving-actions mb-5"><BackToListing className="receiving-button secondary" fallback="/return/manage" /></div>
    <ErrorMessage message={error} />{notice && <div className="receiving-success" role="status">{notice}</div>}
    {item && <><section className="receiving-card"><h2>Return record</h2><p className="receiving-muted mb-4">ID and File Number stay the same. Bulk type changes apply to all units with the updated tracking number. Use Ship out to create a new shipment.</p>
      <form onSubmit={submit}><fieldset disabled={busy || !canPermission('return.edit')}><div className="receiving-grid">
        {fields.map(([field, label, type]) => field === 'pallet' ? <PalletField key={field} disabled={!!item.shipDate || !canPermission('return.inspect')} value={form.pallet} pallets={pallets} onChange={pallet => setForm(previous => ({ ...previous, pallet }))} /> : <label key={field}>{label}{field === 'company' ? <select value={form.company} onChange={e => setForm({ ...form, company: e.target.value })}><option value="">Unspecified</option>{[...new Set([...companies, form.company].filter(Boolean))].map(company => <option key={company}>{company}</option>)}</select> : <input type={type || 'text'} value={form[field]} disabled={(['serial', 'inspectionDate'].includes(field) && !canPermission('return.inspect')) || (field === 'shipDate' && !canPermission('return.ship'))} required={field === 'receivedDate'} maxLength={255} onChange={e => setForm({ ...form, [field]: e.target.value })} />}</label>)}
        <label>Bulk type<select disabled={!canPermission('return.classify')} value={form.bulkType} onChange={e => setForm({ ...form, bulkType: e.target.value })}>{types.map(type => <option key={type}>{type}</option>)}</select></label>
      </div>{[['remark', 'Receiving remark'], ['inspectionRemark', 'Inspection remark']].map(([field, label]) => <label key={field} className="mt-5">{label}<textarea disabled={field === 'inspectionRemark' && !canPermission('return.inspect')} rows={3} maxLength={4000} value={form[field]} onChange={e => setForm({ ...form, [field]: e.target.value })} /></label>)}
      <div className="receiving-actions"><button type="submit">Save record</button><Link to={'/return/' + item.fileNo}>View record</Link><Link to="/return/manage">Back to manage records</Link></div></fieldset></form>
    </section><section className="receiving-card"><h2>Remove record</h2><p className="receiving-muted mb-4">This removes only {item.fileNo} from the returns list and reports. Other units in its delivery stay in place. A copy of the removed record is kept in the admin history.</p>
      <form onSubmit={e => submit(e, true)}><fieldset disabled={busy || !canPermission('return.delete')}><label>Enter {item.fileNo} to confirm<input value={confirmation} onChange={e => setConfirmation(e.target.value)} autoComplete="off" /></label><div className="receiving-actions"><button type="submit" className="danger" disabled={confirmation !== item.fileNo}>Remove record</button></div></fieldset></form>
    </section></>}
  </ReceivingLayout>;
}
