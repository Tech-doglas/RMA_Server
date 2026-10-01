import { canPermission } from '../common/access';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { RecordLink as Link, useListState } from '../common/listNavigation';
import ReceivingLayout, { ErrorMessage, InspectionStatus, ShippingStatus } from './ReceivingLayout';
import { receivingApi, statusOf } from './receivingApi';

const groupKey = item => item.tracking?.trim() ? 'tracking:' + item.tracking.trim() : 'delivery:' + (item.groupId || item.id);

export default function ReturnReceivingList() {
  const navigate = useNavigate();
  const location = useLocation();
  const [lookup, setLookup] = useState('');
  const [opening, setOpening] = useState(false);
  const [items, setItems] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useListState('filters', { search: '', status: '', received: '', company: '' });
  const [page, setPage] = useListState('page', 1);
  const [collapsed, setCollapsed] = useState(new Set());
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const data = await receivingApi('/units');
      const options = [...new Set([...(data.companies || []), ...data.items.map(item => item.company).filter(Boolean)])].sort();
      setItems(data.items); setCompanies(options);
      setFilters(previous => !previous.company || options.includes(previous.company) ? previous : { ...previous, company: '' });
    }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [setFilters]);
  useEffect(() => {
    load();
    window.addEventListener('focus', load);
    return () => window.removeEventListener('focus', load);
  }, [load]);
  const scope = items;
  async function openUnit(event) {
    event.preventDefault(); setError('');
    const value = lookup.trim();
    if (!/^(?:sid-)?\d+$/i.test(value)) { setError('Enter an internal ID or File Number, such as 123 or sid-0123.'); return; }
    setOpening(true);
    try {
      const result = await receivingApi('/units/' + encodeURIComponent(value));
      navigate('/return/' + result.item.fileNo, { state: { returnTo: location.pathname + location.search } });
    } catch (err) { setError(err.message); }
    finally { setOpening(false); }
  }
  const quantities = useMemo(() => {
    const totals = new Map();
    for (const item of items) {
      const key = groupKey(item);
      totals.set(key, (totals.get(key) || 0) + 1);
    }
    return totals;
  }, [items]);
  const visible = useMemo(() => scope.filter(item =>
    (!filters.search || [item.fileNo, item.id, item.tracking, item.laptop, item.serial, item.pallet, item.shipBatch, item.bulkType].join(' ').toLowerCase().includes(filters.search.toLowerCase())) &&
    (!filters.status || statusOf(item) === filters.status) && (!filters.received || item.receivedDate === filters.received) &&
    (!filters.company || item.company === filters.company)
  ), [scope, filters]);
  const groups = useMemo(() => {
    const grouped = new Map();
    for (const item of visible) {
      const tracking = (item.tracking || '').trim();
      // Untracked units belong only to their own delivery, not one shared group.
      const key = groupKey(item);
      if (!grouped.has(key)) grouped.set(key, { key, tracking, items: [] });
      grouped.get(key).items.push(item);
    }
    return Array.from(grouped.values());
  }, [visible]);
  const toggleGroup = key => setCollapsed(previous => {
    const next = new Set(previous);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const update = (key, value) => { setFilters({ ...filters, [key]: value }); setPage(1); setCollapsed(new Set()); };
  // Paginate complete groups so matching tracking numbers stay together.
  const pages = Math.max(1, Math.ceil(groups.length / 50));
  const currentPage = Math.min(page, pages);
  const stats = [['Received units', scope.length], ['Awaiting inspection', scope.filter(item => !item.inspectionDate && !item.shipDate).length], ['Ready to ship', scope.filter(item => item.inspectionDate && !item.shipDate).length], ['Shipped', scope.filter(item => item.shipDate).length]];
  return <ReceivingLayout title="Returns" subtitle="Track every laptop from receiving through inspection and shipment." primaryAction={canPermission('return.receive') && <Link className="receiving-primary-action" to="/return/input"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" focusable="false"><path d="M12 5v14M5 12h14" /></svg><span>Receive delivery</span></Link>}>
    <ErrorMessage message={error} />
    <form className="receiving-card" onSubmit={openUnit}><label>Open unit by ID or File Number<input value={lookup} onChange={e => setLookup(e.target.value)} placeholder="Scan a label or enter 123 / sid-0123" required /></label><div className="receiving-actions"><button disabled={opening}>{opening ? 'Opening…' : 'Open unit'}</button></div></form>
    <div className="receiving-stats">{stats.map(([label, value]) => <div className="receiving-stat" key={label}><span>{label}</span><strong>{loading ? '—' : value}</strong></div>)}</div>
    <section className="receiving-card"><div className="receiving-grid">
      <label>Search returns<input value={filters.search} onChange={e => update('search', e.target.value)} placeholder="File no., tracking, laptop, serial, pallet…" /></label>
      <label>Status<select value={filters.status} onChange={e => update('status', e.target.value)}><option value="">All statuses</option><option>Awaiting inspection</option><option>Inspected</option><option>Shipped</option></select></label>
      <label>Received date<input type="date" value={filters.received} onChange={e => update('received', e.target.value)} /></label>
      <label>Company<select value={filters.company} onChange={e => update('company', e.target.value)}><option value="">All companies</option>{companies.map(company => <option key={company}>{company}</option>)}</select></label>
    </div><div className="receiving-actions"><button className="secondary" onClick={load} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</button><button className="secondary" onClick={() => { setFilters({ search: '', status: '', received: '', company: '' }); setPage(1); setCollapsed(new Set()); }}>Clear filters</button><span className="receiving-muted">{visible.length} units · {groups.length} groups</span></div></section>
    <div className="receiving-table-wrap"><table className="receiving-table"><thead><tr>{['File no.', 'Laptop', 'Received', 'Unit', 'Serial', 'Pallet', 'Bulk type', 'Inspection', 'Shipping', 'Ship batch'].map(label => <th key={label}>{label}</th>)}</tr></thead>
    {groups.slice((currentPage - 1) * 50, currentPage * 50).map(group => <tbody key={group.key}>
      <tr className="receiving-group"><th colSpan={10} scope="rowgroup"><button type="button" aria-expanded={!collapsed.has(group.key)} onClick={() => toggleGroup(group.key)}>
        <span aria-hidden="true">{collapsed.has(group.key) ? '▸' : '▾'}</span>
        <span>{group.tracking ? 'Tracking # ' + group.tracking : 'No tracking number · ' + group.items[0].fileNo}</span>
        <span className="receiving-group-count">Quantity: {quantities.get(group.key)} {group.items.length !== quantities.get(group.key) && ' · Showing ' + group.items.length}</span>
      </button></th></tr>
      {!collapsed.has(group.key) && group.items.map(item => <tr key={item.id}>
        <td><Link to={'/return/' + item.fileNo}>{item.fileNo}</Link></td><td>{item.laptop || 'Unnamed laptop'}</td><td>{item.receivedDate}</td><td>{item.unitIndex} / {item.groupSize}</td><td>{item.serial || '—'}</td><td>{item.pallet || '—'}</td><td>{item.bulkType || '—'}</td><td><InspectionStatus item={item} /></td><td><ShippingStatus item={item} /></td><td>{item.shipBatch || '—'}</td>
      </tr>)}
    </tbody>)}</table>{!visible.length && <p className="receiving-empty">{loading ? 'Loading returns…' : error ? 'Returns could not be loaded. Use Refresh to retry.' : 'No returns found. Receive a delivery or adjust your filters.'}</p>}</div>
    <div className="receiving-pagination"><span>Page {currentPage} of {pages}</span><div className="flex gap-2"><button className="secondary" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</button><button className="secondary" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>Next</button></div></div>
  </ReceivingLayout>;
}

