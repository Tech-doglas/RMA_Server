import { canPermission } from '../common/access';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RecordLink as Link, useListState } from '../common/listNavigation';
import ReceivingLayout, { ErrorMessage, InspectionStatus, ShippingStatus } from './ReceivingLayout';
import { receivingApi, postJson, today } from './receivingApi';
import ShipmentHistory, { groupShipments, shipmentKey } from './ShipmentHistory';

function UnitTable({ items, selected, toggle, disabled, selectable }) {
  return <div className="receiving-table-wrap"><table className="receiving-table admin-mobile-table"><thead><tr>{selectable && <th>Select</th>}<th>File no.</th><th>Tracking</th><th>Laptop</th><th>Serial</th><th>Pallet</th><th>Inspection</th><th>Shipping</th><th>Ship date</th><th>Shipping batch</th></tr></thead><tbody>{items.map(item => <tr key={item.id}>
    {selectable && <td data-label="Select"><input type="checkbox" aria-label={'Select ' + item.fileNo} checked={selected.includes(item.id)} disabled={disabled || !item.inspectionDate || !!item.shipDate || (!selected.includes(item.id) && selected.length >= 1000)} onChange={() => toggle(item.id)} /></td>}
    <td data-label="File Number"><Link to={'/return/' + item.fileNo}>{item.fileNo}</Link></td><td data-label="Tracking">{item.tracking || '—'}</td><td data-label="Laptop">{item.laptop || 'Unnamed laptop'}</td><td data-label="Serial">{item.serial || '—'}</td><td data-label="Pallet">{item.pallet || 'Unassigned'}</td><td data-label="Inspection"><InspectionStatus item={item} /></td><td data-label="Shipping"><ShippingStatus item={item} /></td><td data-label="Ship date">{item.shipDate || '—'}</td><td data-label="Shipping batch">{item.shipBatch || '—'}</td>
  </tr>)}</tbody></table>{!items.length && <p className="receiving-empty">No units to display.</p>}</div>;
}

export default function ReturnReceivingShip() {
  const unitDialog = useRef(null);
  const [pallets, setPallets] = useState([]);
  const [items, setItems] = useState([]);
  const [pallet, setPallet] = useListState('pallet', '');
  const [expanded, setExpanded] = useListState('expanded', '');
  const [historyKey, setHistoryKey] = useListState('historyKey', '');
  const [selected, setSelected] = useState([]);
  const [shipDate, setShipDate] = useState(today());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [notice, setNotice] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [summary, list] = await Promise.all([receivingApi('/pallets'), receivingApi('/units')]);
      setPallets(summary.pallets); setItems(list.items); setSelected([]);
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const dialog = unitDialog.current;
    if (!expanded || !dialog) return;
    dialog.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { dialog.close(); document.body.style.overflow = previousOverflow; };
  }, [expanded]);
  const showingHistory = expanded === 'shipment-history' && !!historyKey;
  const canShip = canPermission('return.ship');
  const canSelect = canShip && !showingHistory;
  const shipments = useMemo(() => groupShipments(items), [items]);
  const activeShipment = showingHistory ? shipments.find(row => row.key === historyKey) : null;
  const visible = useMemo(() => items.filter(item => showingHistory ? item.shipDate && shipmentKey(item) === historyKey : item.pallet === pallet), [items, pallet, showingHistory, historyKey]);
  const ready = visible.filter(item => item.inspectionDate && !item.shipDate);
  const dialogTitle = showingHistory ? (activeShipment?.batch || 'Shipment on ' + (activeShipment?.dates.join(', ') || 'selected date')) : 'All units on ' + pallet;
  const regionLabel = showingHistory ? 'Shipped units' : 'All units on pallet ' + pallet;
  const changePallet = value => { setPallet(value); setHistoryKey(''); setExpanded(value); setSelected([]); setResult(null); };
  const viewShipment = key => { setHistoryKey(key); setExpanded('shipment-history'); setSelected([]); setResult(null); };
  const toggle = id => setSelected(selected.includes(id) ? selected.filter(value => value !== id) : [...selected, id]);
  async function setPalletStatus(palletName, status) {
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await postJson('/pallet-status', { pallet: palletName, status });
      await load(); setNotice(response.message);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  async function submit(event) {
    event.preventDefault();
    if (!canSelect || busy || !selected.length) return;
    setBusy(true); setError(''); setResult(null);
    try {
      const response = await postJson('/ship', { shipDate, unitIds: selected });
      await load(); setResult(response);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <ReceivingLayout title={canShip ? 'Ship out' : 'Pallets & shipments'} subtitle={canShip ? 'Open a pallet with View units to select inspected units for shipment. Each shipment gets a batch number.' : 'View pallet contents, shipped units, ship dates, and shipping batches. Shipping is not enabled for your department.'}>
    {!expanded && <ErrorMessage message={error} />}
    {notice && <div className="receiving-success" role="status">{notice}</div>}
    {!expanded && result && <div className="receiving-success" role="status"><h2>{result.shippedCount} units shipped · {result.batchId}</h2><p>Ship date: {shipDate}</p>{result.skipped.length > 0 && <p>Skipped: {result.skipped.map(unit => 'Unit ' + unit.id + ' (' + unit.reason + ')').join(', ')}</p>}</div>}
    <section className="receiving-card"><h2>Pallet overview</h2><p className="receiving-muted mb-4">{canPermission('return.pallet_status') ? 'Set a pallet to Locked or Full to stop further unit assignments. Existing units can still be inspected and shipped. Set it to Open to accept more units.' : 'Open any pallet to view all its units, including units that have already shipped.'}</p>
      <div className="receiving-table-wrap"><table className="receiving-table admin-mobile-table receiving-pallet-overview"><thead><tr><th>Pallet</th><th>Status</th><th>Total</th><th>Awaiting inspection</th><th>Inspected / waiting to ship</th><th>Already shipped out</th><th /></tr></thead><tbody>{pallets.map(row => <tr key={row.pallet}>
        <td data-label="Pallet">{row.pallet}</td><td data-label="Status">{canPermission('return.pallet_status') ? <select aria-label={'Status for pallet ' + row.pallet} disabled={busy || loading} value={row.status || 'OPEN'} onChange={event => setPalletStatus(row.pallet, event.target.value)}><option value="OPEN">Open</option><option value="LOCKED">Locked</option><option value="FULL">Full</option></select> : ({ OPEN: 'Open', LOCKED: 'Locked', FULL: 'Full' }[row.status || 'OPEN'] || row.status)}</td>
        <td data-label="Total">{row.total}</td><td data-label="Awaiting inspection">{row.total - row.ready - row.shipped}</td><td data-label="Ready to ship">{row.ready}</td><td data-label="Shipped">{row.shipped}</td><td data-label="Units"><button type="button" className="secondary" aria-haspopup="dialog" disabled={busy || loading} onClick={() => changePallet(row.pallet)}>View units</button></td>
      </tr>)}</tbody></table>{!pallets.length && <p className="receiving-empty">{loading ? 'Loading pallets…' : 'Assign pallets during inspection to see them here.'}</p>}</div>
    </section>
    <ShipmentHistory shipments={shipments} onView={viewShipment} loading={loading} />
    {expanded && <dialog ref={unitDialog} className="receiving-ship-dialog" aria-labelledby="ship-dialog-title" onCancel={() => setExpanded('')}><div role="region" aria-label={regionLabel}>
      <header className="receiving-ship-dialog-header"><div><h2 id="ship-dialog-title">{dialogTitle} · {visible.length}</h2><p className="receiving-muted">{ready.length} ready to ship · {visible.filter(item => item.shipDate).length} already shipped</p></div><button type="button" className="secondary" aria-label="Close pallet units" disabled={busy} onClick={() => setExpanded('')}>Close</button></header>
      <ErrorMessage message={error} />{result && <div className="receiving-success" role="status">{result.shippedCount} units shipped · {result.batchId}</div>}
      <form onSubmit={submit}><fieldset disabled={busy || loading}>{canSelect && <div className="receiving-ship-toolbar"><label>Ship date<input type="date" required value={shipDate} onChange={e => setShipDate(e.target.value)} /></label><button type="button" className="secondary" disabled={!ready.length} onClick={() => setSelected(ready.slice(0, 1000).map(item => item.id))}>Select ready units{ready.length > 1000 ? ' (first 1000)' : ''}</button><button type="button" className="secondary" onClick={() => setSelected([])}>Clear selection</button></div>}
      <div className="receiving-ship-unit-scroll"><UnitTable items={visible} selected={selected} toggle={toggle} selectable={canSelect} disabled={busy || loading} /></div>
      <footer className="receiving-ship-dialog-footer"><span>{canSelect ? selected.length + ' selected · ' : ''}{visible.length} units {showingHistory ? 'in this shipment' : 'on this pallet'}</span>{canSelect && <button type="submit" disabled={!selected.length}>{busy ? 'Shipping…' : 'Ship ' + selected.length + ' selected units'}</button>}</footer></fieldset></form>
    </div></dialog>}
  </ReceivingLayout>;
}

