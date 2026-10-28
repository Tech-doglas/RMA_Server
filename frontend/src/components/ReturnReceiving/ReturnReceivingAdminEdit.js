import { canPermission } from '../common/access';
import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { RecordLink as Link, BackToListing, listOrigin } from '../common/listNavigation';
import ReceivingLayout, { SuccessMessage, ErrorMessage } from './ReceivingLayout';
import { receivingApi } from './receivingApi';
import PalletField from './PalletField';
import { DeliveryQuantityEditor, RecordPhotoEditor, preventInputEnter } from './RecordEditControls';

const receivingFields = [
  ['tracking', 'Tracking number'], ['receivedDate', 'Received date', 'date'], ['company', 'Company'],
  ['upc', 'UPC/Item code'], ['laptop', 'Item code/name'],
  ['OrderNumber', 'Order number'], ['Code', 'Code'],
];
const inspectionFields = [['serial', 'Serial number'], ['inspectionDate', 'Inspection date', 'date']];
const shippingFields = [['shipDate', 'Ship date', 'date'], ['shipBatch', 'Shipping batch']];
const textFields = [...receivingFields, ...inspectionFields, ...shippingFields].map(([field]) => field)
  .concat(['pallet', 'bulkType', 'remark', 'inspectionRemark', 'itemInfo']);
const toForm = item => ({ ...Object.fromEntries(textFields.map(field => [field, item[field] || ''])), Recorded: !!item.Recorded });

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
  function showRecord(data) {
    setItem(data.item); setForm(toForm(data.item)); setTypes(data.bulkTypes || []);
    setCompanies(data.companies || []); setPallets(data.availablePallets || []);
  }
  useEffect(() => {
    let active = true;
    receivingApi('/units/' + encodeURIComponent(id)).then(data => {
      if (active) showRecord(data);
    }).catch(err => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [id]);
  const historical = item && (item.legacyId != null || (item.groupId || '').startsWith('legacy_'));
  const dirty = item && JSON.stringify(form) !== JSON.stringify(toForm(item));
  const canEdit = canPermission('return.edit');
  function change(field, value) { setForm(previous => ({ ...previous, [field]: value })); setNotice(''); }
  async function submit(event, remove = false) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      if (!remove && !historical) {
        for (const [field, label] of [['tracking', 'Tracking number'], ['company', 'Company'], ['upc', 'UPC/Item code']]) {
          if (!form[field].trim()) throw new Error(label + ' is required.');
        }
      }
      const result = await receivingApi('/admin/units/' + encodeURIComponent(id), { method: remove ? 'DELETE' : 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(remove ? { confirmFileNo: confirmation } : form) });
      if (remove) navigate(listOrigin(location, '/return/manage'));
      else {
        const saved = { ...item, ...form, ...result.item };
        setItem(saved); setForm(toForm(saved)); setNotice(result.message);
      }
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  function renderField([field, label, type], permission) {
    const required = field === 'receivedDate' || (!historical && ['tracking', 'company', 'upc'].includes(field));
    return <label key={field}><span className={required ? 'receiving-required-label' : ''}>{label}</span>
      {field === 'company' ? <select value={form.company} required={required} onChange={event => change(field, event.target.value)}><option value="">Select a company</option>{[...new Set([...companies, form.company].filter(Boolean))].map(company => <option key={company}>{company}</option>)}</select> :
        <input type={type || 'text'} value={form[field]} disabled={permission && !canPermission(permission)} required={required} maxLength={255} placeholder={field === 'shipBatch' ? 'e.g., ship.0001' : undefined} onChange={event => change(field, event.target.value)} />}
    </label>;
  }
  return <ReceivingLayout title={item ? 'Edit ' + item.fileNo : 'Edit return record'} subtitle="Update receiving information, inspection, shipping, quantity and photos.">
    <div className="receiving-actions mb-5"><BackToListing className="receiving-button secondary" fallback="/return/manage" /></div>
    <ErrorMessage message={error} onClose={() => setError('')} /><SuccessMessage message={notice} onClose={() => setNotice('')} />
    {!item && !error && <p role="status">Loading record…</p>}
    {item && <>
      <section className="receiving-card"><h2>Record identification</h2><div className="receiving-grid">
        <label>File Number<input readOnly value={item.fileNo} /></label><label>Internal ID<input readOnly value={item.id} /></label>
        <label>Created at<input readOnly value={item.timestamp || 'Not available'} /></label>
      </div><p className="receiving-muted mt-3">These are assigned automatically. Quantity changes preserve existing File Numbers. Fields marked * are required for new receiving records.</p></section>
      <form onSubmit={submit} onKeyDown={preventInputEnter}><fieldset disabled={busy || !canEdit}>
        <section className="receiving-card"><h2>Receiving information</h2><div className="receiving-grid">
          {receivingFields.map(field => renderField(field))}
          <label>Recorded status<select value={form.Recorded ? 'yes' : 'no'} onChange={event => change('Recorded', event.target.value === 'yes')}><option value="no">Not recorded</option><option value="yes">Recorded</option></select></label>
          <label>Bulk type<select disabled={!canPermission('return.classify')} value={form.bulkType} onChange={event => change('bulkType', event.target.value)}>{[...new Set([...types, form.bulkType].filter(Boolean))].map(type => <option key={type}>{type}</option>)}</select></label>
        </div><p className="receiving-muted mt-3">Bulk type changes apply to accessible units with the updated tracking number.</p>
        {[['itemInfo', 'Other information'], ['remark', 'Receiving remark']].map(([field, label]) => <label key={field} className="mt-4">{label}<textarea rows={3} maxLength={4000} value={form[field]} onChange={event => change(field, event.target.value)} /></label>)}</section>
        <section className="receiving-card"><h2>Inspection and shipping</h2><div className="receiving-grid">
          {inspectionFields.map(field => renderField(field, 'return.inspect'))}
          <PalletField disabled={!!form.shipDate || !canPermission('return.inspect')} value={form.pallet} pallets={pallets} onChange={pallet => change('pallet', pallet)} />
          {shippingFields.map(field => renderField(field, 'return.ship'))}
        </div><label className="mt-4">Inspection remark<textarea disabled={!canPermission('return.inspect')} rows={3} maxLength={4000} value={form.inspectionRemark} onChange={event => change('inspectionRemark', event.target.value)} /></label>
        <p className="receiving-muted mt-3">Inspection requires a unique serial number. Shipping requires inspection and an existing batch. Clear the ship date to undo this unit’s shipment before changing inspection or pallet information. Use Ship out to create a new batch.</p>
        <div className="receiving-actions"><button type="submit">{busy ? 'Saving…' : 'Save record'}</button><button type="button" className="secondary" disabled={!dirty} onClick={() => { setForm(toForm(item)); setError(''); setNotice(''); }}>Discard changes</button><Link to={'/return/' + item.fileNo}>View record</Link></div></section>
      </fieldset></form>
      {dirty && <p className="receiving-muted mb-4" role="status">Save or discard record changes before editing quantity or photos.</p>}
      <DeliveryQuantityEditor item={item} disabled={busy || dirty || !canEdit} setBusy={setBusy} onSaved={async message => { showRecord(await receivingApi('/units/' + encodeURIComponent(id))); setNotice(message); }} />
      <RecordPhotoEditor item={item} field="images" title="Shipping label photos" disabled={busy || dirty || !canEdit} setBusy={setBusy} onSaved={(field, photos) => setItem(previous => ({ ...previous, [field]: photos }))} />
      <RecordPhotoEditor item={item} field="unitImages" title="Unit photos" disabled={busy || dirty || !canEdit} setBusy={setBusy} onSaved={(field, photos) => setItem(previous => ({ ...previous, [field]: photos }))} />
      <section className="receiving-card"><h2>Remove record</h2><p className="receiving-muted mb-4">Remove only {item.fileNo}. A copy stays in admin history; other delivery units remain.</p>
        <form onSubmit={event => submit(event, true)} onKeyDown={preventInputEnter}><fieldset disabled={busy || !canPermission('return.delete')}><label>Enter {item.fileNo} to confirm<input value={confirmation} onChange={event => setConfirmation(event.target.value)} autoComplete="off" /></label><div className="receiving-actions"><button type="submit" className="danger" disabled={confirmation !== item.fileNo}>Remove record</button></div></fieldset></form>
      </section>
    </>}
  </ReceivingLayout>;
}
