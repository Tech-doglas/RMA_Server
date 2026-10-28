import { canPermission } from '../common/access';
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { BackToListing, RecordLink as Link } from '../common/listNavigation';
import ReceivingLayout, { SuccessMessage, ErrorMessage, Status } from './ReceivingLayout';
import { receivingApi, postJson, SERVER, today } from './receivingApi';
import FileBarcode from './FileBarcode';
import FileLabels, { printFileLabels } from './FileLabels';
import UnitPhotoUpload from './UnitPhotoUpload';
import PalletField from './PalletField';

function Photos({ title, images }) {
  return <section className="receiving-card"><h2>{title} · {images.length}</h2><div className="receiving-photos">
    {images.map((url, index) => <a key={url} href={SERVER + url} target="_blank" rel="noreferrer"><img src={SERVER + url} alt={title + ' ' + (index + 1)} /></a>)}
  </div>{!images.length && <p className="receiving-muted">No photos attached.</p>}</section>;
}
export default function ReturnReceivingDetails() {
  const { id } = useParams();
  const [item, setItem] = useState(null);
  const [inspection, setInspection] = useState({});
  const [bulk, setBulk] = useState('');
  const [bulkTypes, setBulkTypes] = useState(['REGULAR', 'BULK_NEW']);
  const [pallets, setPallets] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState('');
  useEffect(() => {
    let active = true;
    setItem(null); setLoading(true); setError(''); setNotice(''); setQuantity('');
    receivingApi('/units/' + encodeURIComponent(id)).then(data => {
      if (!active) return;
      setItem(data.item); setBulk(data.item.bulkType || 'REGULAR');
      setPallets(data.availablePallets || []);
      setBulkTypes(data.bulkTypes || ['REGULAR', 'BULK_NEW']);
      setInspection({ inspectionDate: data.item.inspectionDate || today(), serial: data.item.serial || '', pallet: data.item.pallet || '', inspectionRemark: data.item.inspectionRemark || '' });
    }).catch(err => { if (active) setError(err.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]);
  async function save(event, kind) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      const result = await postJson('/units/' + encodeURIComponent(id) + '/' + kind, kind === 'inspection' ? inspection : kind === 'quantity' ? { quantity: Number(quantity) } : { bulkType: bulk });
      const data = await receivingApi('/units/' + encodeURIComponent(id));
      setItem(data.item); setPallets(data.availablePallets || []);
      setNotice(kind === 'inspection' ? 'Inspection saved.' : kind === 'quantity' ? 'Quantity confirmed. This delivery has ' + result.quantity + ' unit(s), each with its own File Number.' : 'Bulk type saved for ' + result.updatedCount + ' unit(s).');
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  const change = e => setInspection({ ...inspection, [e.target.name]: e.target.value });
  return <ReceivingLayout title={item ? item.fileNo : 'Return details'} subtitle={item ? item.quantityKnown === 0 ? 'Historical receiving record · quantity not recorded' : 'Unit ' + item.unitIndex + ' of ' + item.groupSize + ' in this delivery' : ''}>
    <div className="receiving-actions mb-5"><BackToListing className="receiving-button secondary" fallback="/return" /></div>
    <ErrorMessage message={error} onClose={() => setError('')} /><SuccessMessage message={notice} onClose={() => setNotice('')} />
    {loading && <p className="receiving-empty">Loading return…</p>}
    {item && <>
      {item.quantityKnown === 0 && <section className="receiving-card"><h2>Confirm delivery quantity</h2><p className="receiving-muted mb-4">This existing receiving record did not include a unit count. Check the delivery and enter its quantity before inspection. The original record and File Number are kept; additional units receive their own File Numbers.</p>
        {canPermission('return.receive') ? <form onSubmit={e => save(e, 'quantity')}><fieldset disabled={busy}><label>Confirmed quantity<input type="number" min="1" max="100" step="1" required value={quantity} onChange={e => setQuantity(e.target.value)} placeholder="Enter the checked unit count" /></label><div className="receiving-actions"><button type="submit">Confirm quantity</button></div></fieldset></form> : <p>A staff member with Receive deliveries permission can confirm this quantity.</p>}
      </section>}
      <section className="receiving-card"><div className="flex justify-between gap-4 mb-5"><h2>{item.laptop || (item.quantityKnown === 0 ? 'Historical receiving record' : 'Unnamed item')}</h2><Status item={item} /></div>
      <div className="mb-5"><FileBarcode fileNo={item.fileNo} /><p className="receiving-muted">{item.fileNo}</p></div>
      <dl>{[['Internal ID', item.id], ['File no.', item.fileNo], ['Delivery quantity', item.quantityKnown === 0 ? 'Not recorded' : item.groupSize], ['Tracking #', item.tracking], ['Received date', item.receivedDate], ['Company', item.company], ['UPC/Item code', item.upc], ['Item name', item.itemName], ['Other information', item.itemInfo], ['Serial', item.serial], ['Pallet', item.pallet], ['Inspection date', item.inspectionDate], ['Ship date', item.shipDate], ['Ship batch', item.shipBatch], ['Bulk type', item.bulkType], ['Original code', item.Code], ['Order number', item.OrderNumber], ['Recorded', item.Recorded ? 'Yes' : 'No'], ['Receiving remark', item.remark], ['Inspection remark', item.inspectionRemark]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || '—'}</dd></div>)}</dl>
      <div className="receiving-actions">{canPermission('return.print') && <button onClick={printFileLabels}>Print file label</button>}{canPermission('return.print') && <button className="secondary" onClick={() => window.print()}>Print unit record</button>}{(canPermission('return.edit') || canPermission('return.delete')) && <Link to={'/return/admin/' + item.fileNo}>Edit or remove record</Link>}</div></section>
      <Photos title="Shipping label photos" images={item.images} /><Photos title="Unit photos" images={item.unitImages} />
      {canPermission('return.photos') && <UnitPhotoUpload key={item.fileNo} item={item} onSaved={unitImages => setItem(previous => ({ ...previous, unitImages }))} />}
      <section className="receiving-card"><h2>Inspection</h2>
      {item.shipDate ? <p className="receiving-muted">This unit shipped in {item.shipBatch}. Its inspection is complete.</p> : <form onSubmit={e => save(e, 'inspection')}><fieldset disabled={busy || item.quantityKnown === 0 || !canPermission('return.inspect')}><div className="receiving-grid">
        <label>Inspection date<input type="date" required name="inspectionDate" value={inspection.inspectionDate} onChange={change} /></label>
        <label>Serial number<input required name="serial" value={inspection.serial} onChange={change} maxLength={255} placeholder="Scan or enter serial number" /></label>
        <PalletField value={inspection.pallet || ''} onChange={pallet => setInspection(previous => ({ ...previous, pallet }))} pallets={pallets} />
      </div><label className="mt-5">Inspection remark<textarea name="inspectionRemark" value={inspection.inspectionRemark} onChange={change} maxLength={4000} rows={3} /></label>
      <div className="receiving-actions"><button type="submit">{busy ? 'Saving…' : 'Save inspection'}</button></div></fieldset></form>}</section>
      <section className="receiving-card"><h2>Bulk type</h2><p className="receiving-muted mb-4">{item.tracking ? 'Applies to every unit with tracking number ' + item.tracking + '.' : 'Applies to this unit only because it has no tracking number.'}</p>
      <form onSubmit={e => save(e, 'bulk-type')}><fieldset disabled={busy || !canPermission('return.classify')}><label>Bulk type<select value={bulk} onChange={e => setBulk(e.target.value)}>{bulkTypes.map(type => <option key={type} value={type}>{type}</option>)}</select></label><div className="receiving-actions"><button type="submit">Save bulk type</button></div></fieldset></form></section>
      {item.siblings.length > 0 && <section className="receiving-card"><h2>Other items in this delivery</h2><div className="receiving-table-wrap"><table className="receiving-table"><thead><tr><th>File no.</th><th>Unit</th><th>Item code/name</th><th>Status</th></tr></thead><tbody>{item.siblings.map(unit => <tr key={unit.id}><td><Link to={'/return/' + unit.fileNo}>{unit.fileNo}</Link></td><td>{unit.unitIndex}</td><td>{unit.laptop || 'Unnamed item'}</td><td><Status item={unit} /></td></tr>)}</tbody></table></div></section>}
      <FileLabels items={[item]} />
    </>}
  </ReceivingLayout>;
}
