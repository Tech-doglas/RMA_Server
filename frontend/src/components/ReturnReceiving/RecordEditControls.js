import React, { useEffect, useState } from 'react';
import { canPermission } from '../common/access';
import { receivingApi, SERVER } from './receivingApi';
import { SuccessMessage, ErrorMessage } from './ReceivingLayout';
import UnitPhotoPicker from './UnitPhotoPicker';
import PhotoPreview from './PhotoPreview';
import { optimizeImageForUpload } from './imageUpload';

export function preventInputEnter(event) {
  if (event.key === 'Enter' && event.target.tagName === 'INPUT' &&
      !['file', 'button', 'submit', 'reset'].includes(event.target.type) &&
      !event.nativeEvent.isComposing) event.preventDefault();
}

export function RecordPhotoEditor({ item, field, title, disabled, setBusy, onSaved }) {
  const photos = item[field] || [];
  const [keep, setKeep] = useState(photos);
  const [files, setFiles] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const photoKey = JSON.stringify(photos);
  useEffect(() => { setKeep(JSON.parse(photoKey)); setFiles([]); }, [photoKey, item.id]);
  async function save(event) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      const body = new FormData();
      body.append('field', field); body.append('expected', photoKey); body.append('keep', JSON.stringify(keep));
      for (let index = 0; index < files.length; index++) {
        const file = await optimizeImageForUpload(files[index], index);
        if (file.size > 4 * 1024 * 1024) throw new Error('Choose a smaller photo. Each photo must be at most 4 MB.');
        body.append('images', file);
      }
      const result = await receivingApi('/admin/units/' + item.fileNo + '/photos', { method: 'POST', body });
      onSaved(field, result.photos); setFiles([]); setNotice(result.message);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return <section className="receiving-card"><h2>{title}</h2>
    <p className="receiving-muted">Preview photos, uncheck those to remove, and select replacements. Changes apply only to this record when you save this section.</p>
    <ErrorMessage message={error} onClose={() => setError('')} /><SuccessMessage message={notice} onClose={() => setNotice('')} />
    <form onSubmit={save} onKeyDown={preventInputEnter}><fieldset disabled={disabled || !canPermission('return.photos')}>
      <ul className="receiving-selected-photos">{photos.map((url, index) => <li key={url}>
        <PhotoPreview url={SERVER + url} name={title + ' ' + (index + 1)} label={title + ' ' + (index + 1)} />
        <div className="receiving-selected-photo-info"><label className="receiving-inline-check"><input type="checkbox" checked={keep.includes(url)} disabled={url.startsWith('/images/return_receiving/')} onChange={event => setKeep(previous => event.target.checked ? photos.filter(photo => photo === url || previous.includes(photo)) : previous.filter(photo => photo !== url))} />Keep {title.toLowerCase()} {index + 1}</label>
          {url.startsWith('/images/return_receiving/') && <span className="receiving-muted">Historical label: manage in Previous records.</span>}</div>
      </li>)}</ul>
      {!photos.length && <p className="receiving-muted mt-3">No photos attached.</p>}
      <UnitPhotoPicker label={'Add ' + title.toLowerCase()} files={files} onChange={setFiles} maxPhotos={Math.max(0, 5 - keep.length)} />
      <div className="receiving-actions"><button type="submit" disabled={(!files.length && JSON.stringify(keep) === photoKey) || keep.length + files.length > 5}>Save {title.toLowerCase()}</button></div>
    </fieldset></form>
  </section>;
}

export function DeliveryQuantityEditor({ item, disabled, setBusy, onSaved }) {
  const members = [item, ...(item.siblings || [])].sort((a, b) => (a.unitIndex || 1) - (b.unitIndex || 1));
  const current = members.length;
  const [quantity, setQuantity] = useState(item.quantityKnown === 0 ? '' : String(current));
  const [removeIds, setRemoveIds] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => { setQuantity(item.quantityKnown === 0 ? '' : String(current)); setRemoveIds([]); }, [item.id, current, item.quantityKnown]);
  const count = Number(quantity);
  const reducing = count < current;
  const valid = Number.isInteger(count) && count >= 1 && count <= 100;
  const missingPermission = reducing ? !canPermission('return.delete') : (count > current || item.quantityKnown === 0) && !canPermission('return.receive');
  async function save(event) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const result = await receivingApi('/admin/units/' + item.fileNo + '/quantity', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity: count, expectedIds: members.map(member => member.id), removeIds }) });
      await onSaved(result.message);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return <section className="receiving-card"><h2>Delivery quantity</h2><ErrorMessage message={error} onClose={() => setError('')} />
    <p className="receiving-muted">{item.quantityKnown === 0 ? 'Historical quantity has not been confirmed.' : current + ' units in this delivery.'} Increasing quantity creates new File Numbers and copies this item’s receiving information and label photos. Serial numbers, unit photos, inspection and shipping are not copied.</p>
    <form onSubmit={save} onKeyDown={preventInputEnter}><fieldset disabled={disabled}>
      <label className="mt-4">Delivery quantity<input type="number" min="1" max="100" step="1" required value={quantity} onChange={event => { setQuantity(event.target.value); setRemoveIds([]); }} /></label>
      {valid && reducing && <div className="mt-4"><p>Select {current - count} unit(s) to remove. Removed records are kept in admin history. The open record, historical parent, inspected units and shipped units must stay.</p>
        {members.map(member => <label key={member.id} className="receiving-inline-check mt-3"><input type="checkbox" checked={removeIds.includes(member.id)} disabled={member.id === item.id || member.legacyId != null || !!member.inspectionDate || !!member.shipDate || !!member.shipBatch || !canPermission('return.delete')} onChange={event => setRemoveIds(previous => event.target.checked ? [...previous, member.id] : previous.filter(id => id !== member.id))} />{member.fileNo} · {member.upc || 'No item code'}{member.shipDate ? ' · Shipped' : member.inspectionDate ? ' · Inspected' : ''}</label>)}
      </div>}
      {missingPermission && <p className="receiving-muted mt-3">Your department needs {reducing ? 'Remove return records' : 'Receive deliveries'} permission for this quantity change.</p>}
      <div className="receiving-actions"><button type="submit" disabled={!valid || missingPermission || (count === current && item.quantityKnown !== 0) || (reducing && removeIds.length !== current - count)}>Save delivery quantity</button></div>
    </fieldset></form>
  </section>;
}
