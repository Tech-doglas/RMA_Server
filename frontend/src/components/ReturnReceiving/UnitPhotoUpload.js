import React, { useState } from 'react';
import { SuccessMessage, ErrorMessage } from './ReceivingLayout';
import UnitPhotoPicker from './UnitPhotoPicker';
import { receivingApi } from './receivingApi';
import { optimizeImageForUpload } from './imageUpload';

export default function UnitPhotoUpload({ item, onSaved }) {
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const remaining = Math.max(0, 5 - item.unitImages.length);
  async function upload(event) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      const body = new FormData();
      for (let index = 0; index < files.length; index++) {
        const file = await optimizeImageForUpload(files[index], index);
        if (file.size > 4 * 1024 * 1024) throw new Error(file.name + ' is still over 4 MB. Choose a smaller photo.');
        body.append('images', file);
      }
      const result = await receivingApi('/units/' + encodeURIComponent(item.fileNo) + '/photos', { method: 'POST', body });
      onSaved(result.unitImages); setFiles([]); setNotice(result.message);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return <section className="receiving-card receiving-photo-upload"><h2>Add unit photos</h2><p className="receiving-muted mb-4">Photos are attached only to {item.fileNo}. Existing photos stay in place. Up to 5 photos per unit.</p>
    <ErrorMessage message={error} onClose={() => setError('')} /><SuccessMessage message={notice} onClose={() => setNotice('')} />
    {remaining ? <form onSubmit={upload}><fieldset disabled={busy}><UnitPhotoPicker label="Additional unit photos" files={files} onChange={setFiles} maxPhotos={remaining} /><div className="receiving-actions"><button type="submit" disabled={!files.length}>{busy ? 'Uploading photos…' : 'Save unit photos'}</button></div></fieldset></form> : <p className="receiving-muted">This unit has all 5 photos attached.</p>}
  </section>;
}
