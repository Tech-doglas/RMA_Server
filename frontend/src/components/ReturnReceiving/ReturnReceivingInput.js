import { canPermission } from '../common/access';
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import ReceivingLayout, { ErrorMessage } from './ReceivingLayout';
import { receivingApi, today } from './receivingApi';
import { optimizeImageForUpload } from './imageUpload';
import FileLabels, { printFileLabels } from './FileLabels';
import UnitPhotoPicker from './UnitPhotoPicker';

const emptyUnit = () => ({ laptop: '', images: [] });

export default function ReturnReceivingInput({ department }) {
  const defaultCompany = department === 'SnowBell' ? 'SNOWBELL/XIE/PITY TECH' : '';
  const [delivery, setDelivery] = useState({ tracking: '', receivedDate: today(), remark: '', company: '' });
  const [companies, setCompanies] = useState([]);
  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [units, setUnits] = useState([emptyUnit()]);
  const [quantity, setQuantity] = useState('1');
  const [images, setImages] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const change = event => setDelivery({ ...delivery, [event.target.name]: event.target.value });
  useEffect(() => {
    let active = true;
    receivingApi('/companies').then(data => {
      if (!active) return;
      setCompanies(data.companies);
      if (defaultCompany && data.companies.includes(defaultCompany)) setDelivery(previous => ({ ...previous, company: previous.company || defaultCompany }));
    }).catch(err => { if (active) setError(err.message); }).finally(() => { if (active) setLoadingCompanies(false); });
    return () => { active = false; };
  }, [defaultCompany]);
  function resizeQuantity(value) {
    setQuantity(value);
    const count = Number(value);
    if (Number.isInteger(count) && count >= 1 && count <= 100) {
      setUnits(previous => Array.from({ length: count }, (_, index) => previous[index] || emptyUnit()));
    }
  }

  function selectImages(files, update) {
    const list = Array.from(files || []);
    if (list.length > 5) { setError('Choose at most 5 photos per label or unit.'); return; }
    if (list.some(file => !['image/jpeg', 'image/png'].includes(file.type))) { setError('Choose JPEG or PNG photos.'); return; }
    setError(''); update(list);
  }
  async function appendImages(body, key, files) {
    for (let i = 0; i < files.length; i++) {
      const file = await optimizeImageForUpload(files[i], i);
      if (file.size > 4 * 1024 * 1024) throw new Error(file.name + ' is still over 4 MB. Choose a smaller photo.');
      body.append(key, file);
    }
  }
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const body = new FormData();
      if (Number(quantity) !== units.length) throw new Error('Quantity must be a whole number from 1 to 100.');
      body.append('payload', JSON.stringify({ ...delivery, quantity: units.length, units: units.map(unit => ({ laptop: unit.laptop })) }));
      await appendImages(body, 'images', images);
      for (let i = 0; i < units.length; i++) await appendImages(body, 'unitImages_' + i, units[i].images);
      setResult(await receivingApi('/units', { method: 'POST', body }));
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return <ReceivingLayout title="Receive a delivery" subtitle="One delivery, one record for every laptop. File numbers are assigned when you save.">
    <ErrorMessage message={error} />
    {result ? <section className="receiving-success" role="status">
      <h2>{result.quantity} {result.quantity === 1 ? 'unit' : 'units'} received</h2>
      <p>Open a file to inspect the laptop. Print the file number from its detail page.</p>
      <div className="receiving-actions">{result.fileNos.map(fileNo => <Link key={fileNo} to={'/return/' + fileNo}>{fileNo}</Link>)}</div>
      <div className="receiving-actions">{canPermission('return.print') && <button onClick={printFileLabels}>Print all file labels</button>}</div>
      <div className="receiving-actions"><button onClick={() => {
        setResult(null); setDelivery({ tracking: '', receivedDate: today(), remark: '', company: companies.includes(defaultCompany) ? defaultCompany : '' }); setImages([]); setUnits([emptyUnit()]); setQuantity('1');
      }}>Receive another delivery</button><Link to="/return">View returns</Link></div>
    </section> : <form onSubmit={submit}><fieldset disabled={busy}>
      <section className="receiving-card"><h2>Delivery information</h2><div className="receiving-grid">
        <label>Tracking #<input name="tracking" value={delivery.tracking} onChange={change} maxLength={255} placeholder="Scan or enter tracking number" autoFocus /></label>
        <label>Received date<input type="date" name="receivedDate" value={delivery.receivedDate} onChange={change} required /></label>
        <label>Company<select name="company" value={delivery.company} onChange={change} disabled={loadingCompanies}><option value="">{loadingCompanies ? 'Loading companies…' : 'Unspecified'}</option>{companies.map(company => <option key={company}>{company}</option>)}</select></label>
        <label>Quantity in this delivery<input type="number" min="1" max="100" step="1" required value={quantity} onChange={e => resizeQuantity(e.target.value)} /></label>
      </div>
      <label className="mt-5">Receiving remark<textarea name="remark" value={delivery.remark} onChange={change} maxLength={4000} rows={3} placeholder="Packaging condition, missing items, or delivery notes" /></label>
      {canPermission('return.photos') && <label className="mt-5">Shared shipping label photos<input type="file" accept="image/jpeg,image/png" multiple onChange={e => selectImages(e.target.files, setImages)} /></label>}
      <p className="receiving-muted mt-2">Optional. Up to 5 photos, shared by all units. Large photos are optimized before upload.</p>
      {images.length > 0 && <p className="receiving-muted mt-2">{images.map(file => file.name).join(', ')}</p>}
      </section>
      <section className="receiving-card"><h2>Laptops in this delivery · {units.length}</h2>
      {units.map((unit, index) => <div className="receiving-unit" key={index}><h3>Unit {index + 1}</h3><div className="receiving-grid">
        <label>Laptop name<input value={unit.laptop} maxLength={255} placeholder="e.g., Dell Latitude 5420" onChange={e => setUnits(units.map((item, i) => i === index ? { ...item, laptop: e.target.value } : item))} /></label>
        {canPermission('return.photos') && <UnitPhotoPicker files={unit.images} onChange={files => setUnits(previous => previous.map((item, i) => i === index ? { ...item, images: files } : item))} />}
      </div></div>)}
      <div className="receiving-actions"><button className="secondary" type="button" onClick={() => resizeQuantity(String(units.length + 1))} disabled={units.length >= 100}>+ Add laptop</button>
      <button className="secondary" type="button" disabled={units.length === 1} onClick={() => resizeQuantity(String(units.length - 1))}>Remove last laptop</button></div>
      <p className="receiving-muted mt-3">Serial numbers and pallets are assigned during inspection. Receive up to 100 units per delivery.</p></section>
      <div className="receiving-actions"><button type="submit" disabled={loadingCompanies}>{busy ? 'Optimizing photos and saving…' : 'Receive ' + units.length + (units.length === 1 ? ' unit' : ' units')}</button><Link to="/return">Cancel</Link></div>
    </fieldset></form>}
    {result && <FileLabels items={result.fileNos.map((fileNo, index) => ({ fileNo, laptop: units[index].laptop, tracking: delivery.tracking, unitIndex: index + 1, groupSize: result.quantity }))} />}
  </ReceivingLayout>;
}

