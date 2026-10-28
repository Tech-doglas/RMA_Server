import { canPermission } from '../common/access';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { RecordLink as Link, useListState } from '../common/listNavigation';
import ReceivingLayout, { ErrorMessage, InspectionStatus, ShippingStatus } from './ReceivingLayout';
import { receivingApi, statusOf } from './receivingApi';
import { inDateRange, recordDate, SortControls, SortHeader, sortRecords } from './listTable';

const groupKey = item => item.tracking?.trim() ? 'tracking:' + item.tracking.trim() : 'delivery:' + (item.groupId || item.id);
// Historical quantity confirmation creates more units in the original legacy
// group. They stay historical even though only its first unit has a legacyId.
const isNewReceipt = item => item.legacyId == null && !(item.groupId || '').startsWith('legacy_');
const EMPTY_FILTERS = { search: '', status: '', from: '', to: '', company: '', bulkType: '', pallet: '' };
const COLUMNS = [
  { key: 'id', label: 'File no.', value: item => Number(item.id) },
  { key: 'upc', label: 'UPC/Item code' }, { key: 'receivedDate', label: 'Received', value: item => recordDate(item.receivedDate) },
  { key: 'unitIndex', label: 'Unit', value: item => item.quantityKnown === 0 ? null : item.unitIndex },
  { key: 'serial', label: 'Serial' }, { key: 'pallet', label: 'Pallet' }, { key: 'bulkType', label: 'Bulk type' },
  { key: 'inspection', label: 'Inspection', value: item => item.quantityKnown === 0 ? 0 : item.inspectionDate ? 2 : 1 },
  { key: 'shipping', label: 'Shipping', value: item => item.shipDate ? 2 : item.inspectionDate ? 1 : 0 },
  { key: 'shipBatch', label: 'Ship batch' },
];
const SORT_COLUMNS = [...COLUMNS, { key: 'tracking', label: 'Tracking #' }, { key: 'company', label: 'Company' }];

export default function ReturnReceivingList() {
  const navigate = useNavigate();
  const location = useLocation();
  const [lookup, setLookup] = useState('');
  const [opening, setOpening] = useState(false);
  const [items, setItems] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savedFilters, setFilters] = useListState('filters', EMPTY_FILTERS);
  const filters = useMemo(() => ({ ...EMPTY_FILTERS, ...savedFilters,
    from: savedFilters.from ?? savedFilters.received ?? '', to: savedFilters.to ?? savedFilters.received ?? '',
    status: savedFilters.status === 'Quantity to confirm' ? '' : (savedFilters.status || ''),
  }), [savedFilters]);
  const [savedSort, setSort] = useListState('sort', { key: 'id', direction: 'desc' });
  const sort = useMemo(() => savedSort.key === 'laptop' ? { ...savedSort, key: 'upc' } : savedSort, [savedSort]);
  const [page, setPage] = useListState('page', 1);
  const [collapsed, setCollapsed] = useState(new Set());
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const data = await receivingApi('/units');
      const newItems = data.items.filter(isNewReceipt);
      const options = [...new Set([...(data.companies || []), ...newItems.map(item => item.company).filter(Boolean)])].sort();
      setItems(newItems); setCompanies(options);
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
      const previous = totals.get(key) || { count: 0, unknown: false };
      totals.set(key, { count: previous.count + 1, unknown: previous.unknown || item.quantityKnown === 0 });
    }
    return totals;
  }, [items]);
  const bulkTypes = useMemo(() => [...new Set(scope.map(item => item.bulkType).filter(Boolean))].sort(), [scope]);
  const visible = useMemo(() => sortRecords(scope.filter(item =>
    (!filters.search || [item.fileNo, item.id, item.tracking, item.company, item.laptop, item.upc, item.itemName, item.itemInfo, item.serial, item.pallet, item.shipBatch, item.bulkType, item.Code, item.OrderNumber, item.remark].join(' ').toLowerCase().includes(filters.search.trim().toLowerCase())) &&
    (!filters.status || statusOf(item) === filters.status) && inDateRange(item.receivedDate, filters.from, filters.to) &&
    (!filters.company || item.company === filters.company) && (!filters.bulkType || item.bulkType === filters.bulkType) &&
    (!filters.pallet || (item.pallet || '').toLowerCase().includes(filters.pallet.trim().toLowerCase()))
  ), sort, SORT_COLUMNS), [scope, filters, sort]);
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
  const changeSort = value => { setSort(value); setPage(1); };
  // Paginate complete groups so matching tracking numbers stay together.
  const pages = Math.max(1, Math.ceil(groups.length / 50));
  const currentPage = Math.min(page, pages);
  const stats = [['New receiving records', scope.length], ['Awaiting inspection', scope.filter(item => item.quantityKnown !== 0 && !item.inspectionDate && !item.shipDate).length], ['Ready to ship', scope.filter(item => item.inspectionDate && !item.shipDate).length], ['Shipped', scope.filter(item => item.shipDate).length]];
  return <ReceivingLayout title="Returns" subtitle="New receipts only, from arrival through inspection and shipment. Historical receiving data is in Previous records." primaryAction={canPermission('return.receive') && <Link className="receiving-primary-action" to="/return/input"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" focusable="false"><path d="M12 5v14M5 12h14" /></svg><span>Receive delivery</span></Link>}>
    <ErrorMessage message={error} onClose={() => setError('')} />
    <form className="receiving-card" onSubmit={openUnit}><label>Open unit by ID or File Number<input value={lookup} onChange={e => setLookup(e.target.value)} placeholder="Scan a label or enter 123 / sid-0123" required /></label><div className="receiving-actions"><button disabled={opening}>{opening ? 'Opening…' : 'Open unit'}</button></div></form>
    <div className="receiving-stats">{stats.map(([label, value]) => <div className="receiving-stat" key={label}><span>{label}</span><strong>{loading ? '—' : value}</strong></div>)}</div>
    <section className="receiving-card"><div className="receiving-grid">
      <label>Search returns<input value={filters.search} onChange={e => update('search', e.target.value)} placeholder="File no., tracking, UPC/Item code, serial, pallet…" /></label>
      <label>Status<select value={filters.status} onChange={e => update('status', e.target.value)}><option value="">All statuses</option><option>Awaiting inspection</option><option>Inspected</option><option>Shipped</option></select></label>
      <label>Received from<input type="date" value={filters.from} max={filters.to || undefined} onChange={e => update('from', e.target.value)} /></label>
      <label>Received to<input type="date" value={filters.to} min={filters.from || undefined} onChange={e => update('to', e.target.value)} /></label>
      <label>Company<select value={filters.company} onChange={e => update('company', e.target.value)}><option value="">All companies</option>{companies.map(company => <option key={company}>{company}</option>)}</select></label>
      <label>Bulk type filter<select value={filters.bulkType} onChange={e => update('bulkType', e.target.value)}><option value="">All types</option>{bulkTypes.map(type => <option key={type}>{type}</option>)}</select></label>
      <label>Pallet filter<input value={filters.pallet} onChange={e => update('pallet', e.target.value)} placeholder="Pallet name or number" /></label>
    </div><div className="receiving-actions"><button className="secondary" onClick={load} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</button><button className="secondary" onClick={() => { setFilters(EMPTY_FILTERS); setPage(1); setCollapsed(new Set()); }}>Clear filters</button><span className="receiving-muted" role="status">{visible.length} records · {groups.length} groups</span></div>
      {filters.from && filters.to && filters.from > filters.to && <p role="alert" className="receiving-filter-error">Received to must be on or after Received from.</p>}
    </section>
    <SortControls columns={SORT_COLUMNS} sort={sort} onChange={changeSort} />
    <p className="receiving-muted receiving-sort-note">Units with the same tracking number stay together when sorting.</p>
    <div className="receiving-table-wrap"><table className="receiving-table" aria-label="Returns"><thead><tr>{COLUMNS.map(column => <SortHeader key={column.key} column={column} sort={sort} onChange={changeSort} />)}</tr></thead>
    {groups.slice((currentPage - 1) * 50, currentPage * 50).map(group => <tbody key={group.key}>
      <tr className="receiving-group"><th colSpan={10} scope="rowgroup"><button type="button" aria-expanded={!collapsed.has(group.key)} onClick={() => toggleGroup(group.key)}>
        <span aria-hidden="true">{collapsed.has(group.key) ? '▸' : '▾'}</span>
        <span>{group.tracking ? 'Tracking # ' + group.tracking : 'No tracking number · ' + group.items[0].fileNo}</span>
        <span className="receiving-group-count">Quantity: {quantities.get(group.key).unknown ? 'Needs confirmation' : quantities.get(group.key).count} {group.items.length !== quantities.get(group.key).count && ' · Showing ' + group.items.length}</span>
      </button></th></tr>
      {!collapsed.has(group.key) && group.items.map(item => <tr key={item.id}>
        <td><Link to={'/return/' + item.fileNo}>{item.fileNo}</Link></td><td>{item.upc || '—'}</td><td>{item.receivedDate}</td><td>{item.quantityKnown === 0 ? 'Not recorded' : item.unitIndex + ' / ' + item.groupSize}</td><td>{item.serial || '—'}</td><td>{item.pallet || '—'}</td><td>{item.bulkType || '—'}</td><td><InspectionStatus item={item} /></td><td><ShippingStatus item={item} /></td><td>{item.shipBatch || '—'}</td>
      </tr>)}
    </tbody>)}</table>{!visible.length && <p className="receiving-empty">{loading ? 'Loading returns…' : error ? 'Returns could not be loaded. Use Refresh to retry.' : 'No returns found. Receive a delivery or adjust your filters.'}</p>}</div>
    <div className="receiving-pagination"><span>Page {currentPage} of {pages}</span><div className="flex gap-2"><button className="secondary" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</button><button className="secondary" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>Next</button></div></div>
  </ReceivingLayout>;
}
