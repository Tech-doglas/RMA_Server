import React, { useState } from 'react';

// Older imported records can have a ship date without a batch number.
export const shipmentKey = item => item.shipBatch ? 'batch:' + item.shipBatch : 'date:' + item.shipDate;

export function groupShipments(items) {
  const grouped = new Map();
  items.filter(item => item.shipDate).forEach(item => {
    const key = shipmentKey(item);
    if (!grouped.has(key)) grouped.set(key, { key, batch: item.shipBatch || '', dates: new Set(), pallets: new Set(), total: 0 });
    const row = grouped.get(key);
    row.dates.add(item.shipDate);
    row.pallets.add(item.pallet || 'Unassigned');
    row.total += 1;
  });
  return [...grouped.values()].map(row => ({ ...row, dates: [...row.dates].sort(), pallets: [...row.pallets].sort() }))
    .sort((a, b) => b.dates[b.dates.length - 1].localeCompare(a.dates[a.dates.length - 1]) || b.batch.localeCompare(a.batch, undefined, { numeric: true }));
}

export default function ShipmentHistory({ shipments, onView, loading }) {
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(shipments.length / 20));
  const current = Math.min(page, pages);
  return <section className="receiving-card"><h2>Shipment history</h2><p className="receiving-muted mb-4">Check which pallets and units were included in each shipment. Older records without a batch number are grouped by ship date.</p>
    <div className="receiving-table-wrap"><table className="receiving-table admin-mobile-table"><thead><tr><th>Shipping batch</th><th>Ship date</th><th>Pallets</th><th>Units</th><th /></tr></thead><tbody>
      {shipments.slice((current - 1) * 20, current * 20).map(row => <tr key={row.key}><td data-label="Shipping batch">{row.batch || 'No batch recorded'}</td><td data-label="Ship date">{row.dates.join(', ')}</td><td data-label="Pallets" style={{ whiteSpace: 'normal', maxWidth: 360 }}>{row.pallets.join(', ')}</td><td data-label="Units">{row.total}</td><td data-label="Details"><button className="secondary" type="button" aria-haspopup="dialog" onClick={() => onView(row.key)}>View shipped units</button></td></tr>)}
    </tbody></table>{!shipments.length && <p className="receiving-empty">{loading ? 'Loading shipment history…' : 'No shipped units yet.'}</p>}</div>
    {pages > 1 && <div className="receiving-pagination"><span>Shipments · Page {current} of {pages}</span><div className="flex gap-2"><button className="secondary" disabled={current === 1} onClick={() => setPage(current - 1)}>Previous shipments</button><button className="secondary" disabled={current === pages} onClick={() => setPage(current + 1)}>Next shipments</button></div></div>}
  </section>;
}
