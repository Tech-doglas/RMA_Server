import React, { useState } from 'react';
import { ErrorMessage } from './ReceivingLayout';

export default function UnitPhotoPicker({ files, onChange, label = 'Unit photos', maxPhotos = 5 }) {
  const [error, setError] = useState('');
  function add(event) {
    const incoming = Array.from(event.target.files || []);
    event.target.value = '';
    if (!incoming.length) return;
    if (incoming.some(file => !['image/jpeg', 'image/png'].includes(file.type))) { setError('Choose JPEG or PNG photos.'); return; }
    if (files.length + incoming.length > maxPhotos) { setError('You can add ' + Math.max(0, maxPhotos - files.length) + ' more photos.'); return; }
    setError(''); onChange([...files, ...incoming]);
  }
  return <div className="receiving-photo-picker">
    <label>{label}<input type="file" accept="image/jpeg,image/png" multiple onChange={add} disabled={files.length >= maxPhotos} /></label>
    <p className="receiving-muted mt-2">Select several photos or add them one at a time. {files.length} selected · {maxPhotos} available.</p>
    <ErrorMessage message={error} />
    {files.length > 0 && <ul className="receiving-selected-photos">{files.map((file, index) => <li key={index}><span>{index + 1}. {file.name}</span><button type="button" className="secondary" aria-label={'Remove selected photo ' + (index + 1) + ' from ' + label} onClick={() => { setError(''); onChange(files.filter((_, i) => i !== index)); }}>Remove</button></li>)}</ul>}
  </div>;
}
