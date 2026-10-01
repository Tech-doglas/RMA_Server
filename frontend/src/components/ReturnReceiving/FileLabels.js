import React from 'react';
import FileBarcode from './FileBarcode';

export function printFileLabels() {
  document.body.classList.add('receiving-print-labels');
  try { window.print(); }
  finally { document.body.classList.remove('receiving-print-labels'); }
}

export default function FileLabels({ items }) {
  return <section className="receiving-label-sheet" aria-hidden="true">
    {items.map(item => <article className="receiving-file-label" key={item.fileNo}>
      <strong className="receiving-label-number">{item.fileNo}</strong>
      <FileBarcode fileNo={item.fileNo} />
      <strong>{item.laptop || 'Return unit'}</strong>
      <p>{item.tracking ? 'Tracking: ' + item.tracking : 'No tracking number'}</p>
      <p>Unit {item.unitIndex} of {item.groupSize}</p>
    </article>)}
  </section>;
}
