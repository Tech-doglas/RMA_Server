import { canPermission } from '../common/access';
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import ReceivingLayout, { ErrorMessage, SuccessMessage } from './ReceivingLayout';
import { receivingApi, today } from './receivingApi';
import { optimizeImageForUpload } from './imageUpload';
import FileLabels, { printFileLabels } from './FileLabels';
import UnitPhotoPicker from './UnitPhotoPicker';

const emptyUnit = () => ({ upc: '', itemInfo: '', serial: '', images: [] });

export default function ReturnReceivingInput({ department }) {
  const defaultCompany = department || '';
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
      const suggestedCompany = data.companies.length === 1 ? data.companies[0] : data.companies.find(company => company.toLowerCase() === defaultCompany.toLowerCase()) || '';
      if (suggestedCompany) setDelivery(previous => ({ ...previous, company: previous.company || suggestedCompany }));
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
      if (!delivery.tracking.trim()) throw new Error('Tracking number is required.');
      if (!delivery.receivedDate) throw new Error('Received date is required.');
      if (!delivery.company.trim()) throw new Error('Company is required.');
      if (Number(quantity) !== units.length) throw new Error('Quantity must be a whole number from 1 to 100.');
      const missingCode = units.findIndex(unit => !unit.upc.trim());
      if (missingCode !== -1) throw new Error('UPC/Item code for item ' + (missingCode + 1) + ' is required.');
      const serials = units.map(unit => unit.serial.trim().toLowerCase()).filter(Boolean);
      if (new Set(serials).size !== serials.length) throw new Error('Each item must have a different serial number. Check duplicate serial numbers in this delivery.');
      body.append('payload', JSON.stringify({ ...delivery, quantity: units.length, units: units.map(unit => ({ upc: unit.upc, itemInfo: unit.itemInfo, serial: unit.serial })) }));
      await appendImages(body, 'images', images);
      for (let i = 0; i < units.length; i++) await appendImages(body, 'unitImages_' + i, units[i].images);
      setResult(await receivingApi('/units', { method: 'POST', body }));
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return <ReceivingLayout title="Receive a delivery" subtitle="One delivery, one record for every item. File numbers are assigned when you save.">
    <ErrorMessage message={error} onClose={() => setError('')} />
    <SuccessMessage message={result ? 'Delivery saved. Your file labels are ready to print.' : ''} />
    {result ? <section className="receiving-card">
      <h2>{result.quantity} {result.quantity === 1 ? 'unit' : 'units'} received</h2>
      <p>Open a file to inspect the item. Print the file number from its detail page.</p>
      <div className="receiving-actions">{result.fileNos.map(fileNo => <Link key={fileNo} to={'/return/' + fileNo}>{fileNo}</Link>)}</div>
      <div className="receiving-actions">{canPermission('return.print') && <button onClick={printFileLabels}>Print all file labels</button>}</div>
      <div className="receiving-actions"><button onClick={() => {
        setResult(null); setDelivery({ tracking: '', receivedDate: today(), remark: '', company: companies.length === 1 ? companies[0] : companies.find(company => company.toLowerCase() === defaultCompany.toLowerCase()) || '' }); setImages([]); setUnits([emptyUnit()]); setQuantity('1');
      }}>Receive another delivery</button><Link to="/return">View returns</Link></div>
    </section> : <form onSubmit={submit} onKeyDown={event => {
      // Barcode scanners often append Enter. Keep it from saving an unfinished delivery.
      // Leave multiline notes, file pickers and explicit button activation available.
      if (event.key === 'Enter' && event.target.tagName === 'INPUT' &&
          !['file', 'button', 'submit', 'reset'].includes(event.target.type) &&
          !event.nativeEvent.isComposing) event.preventDefault();
    }}><fieldset disabled={busy}>
      <section className="receiving-card"><h2>Delivery information</h2><p className="receiving-muted mb-4">Fields marked * are required.</p><div className="receiving-grid">
        <label><span className="receiving-required-label">Tracking #</span><input name="tracking" value={delivery.tracking} onChange={change} maxLength={255} placeholder="Scan or enter tracking number" required autoFocus /></label>
        <label><span className="receiving-required-label">Received date</span><input type="date" name="receivedDate" value={delivery.receivedDate} onChange={change} required /></label>
        <label><span className="receiving-required-label">Company</span><select name="company" value={delivery.company} onChange={change} required disabled={loadingCompanies}><option value="">{loadingCompanies ? 'Loading companies…' : 'Select a company'}</option>{companies.map(company => <option key={company}>{company}</option>)}</select></label>
        <label><span className="receiving-required-label">Quantity in this delivery</span><input type="number" min="1" max="100" step="1" required value={quantity} onChange={e => resizeQuantity(e.target.value)} /></label>
      </div>
      <label className="mt-5">Receiving remark<textarea name="remark" value={delivery.remark} onChange={change} maxLength={4000} rows={3} placeholder="Packaging condition, missing items, or delivery notes" /></label>
      {canPermission('return.photos') && <div className="mt-5"><UnitPhotoPicker label="Shared shipping label photos" files={images} onChange={setImages} /></div>}
      <p className="receiving-muted mt-2">Optional. Up to 5 photos, shared by all units. Large photos are optimized before upload.</p>
      </section>
      <section className="receiving-card"><h2>Items in this delivery · {units.length}</h2>
      {units.map((unit, index) => <div className="receiving-unit" key={index}><h3>Item {index + 1}</h3><div className="receiving-grid">
        <label><span className="receiving-required-label">UPC/Item code</span><input type="text" value={unit.upc} maxLength={255} required placeholder="Scan or enter UPC/Item code" onChange={e => setUnits(previous => previous.map((item, i) => i === index ? { ...item, upc: e.target.value } : item))} /></label>
        <label>Serial number<input value={unit.serial} maxLength={255} placeholder="Scan or enter serial number" aria-describedby="receiving-serial-help" onChange={e => setUnits(previous => previous.map((item, i) => i === index ? { ...item, serial: e.target.value } : item))} /></label>
        {canPermission('return.photos') && <UnitPhotoPicker files={unit.images} onChange={files => setUnits(previous => previous.map((item, i) => i === index ? { ...item, images: files } : item))} />}
      </div><label className="mt-4">Other information<textarea value={unit.itemInfo} rows={3} maxLength={4000} placeholder="Model, colour, accessories, or other item details (optional)" onChange={e => setUnits(previous => previous.map((item, i) => i === index ? { ...item, itemInfo: e.target.value } : item))} /></label></div>)}
      <div className="receiving-actions"><button className="secondary" type="button" onClick={() => resizeQuantity(String(units.length + 1))} disabled={units.length >= 100}>+ Add item</button>
      <button className="secondary" type="button" disabled={units.length === 1} onClick={() => resizeQuantity(String(units.length - 1))}>Remove last item</button></div>
      <p id="receiving-serial-help" className="receiving-muted mt-3">Serial numbers are optional at receiving and required during inspection. Each item must have a unique serial number. Assign pallets during inspection. Receive up to 100 items per delivery.</p></section>
      <div className="receiving-actions"><button type="submit" disabled={loadingCompanies}>{busy ? 'Optimizing photos and saving…' : 'Receive ' + units.length + (units.length === 1 ? ' unit' : ' units')}</button><Link to="/return">Cancel</Link></div>
    </fieldset></form>}
    {result && <FileLabels items={result.fileNos.map((fileNo, index) => ({ fileNo, upc: units[index].upc, tracking: delivery.tracking, unitIndex: index + 1, groupSize: result.quantity }))} />}
  </ReceivingLayout>;
}
