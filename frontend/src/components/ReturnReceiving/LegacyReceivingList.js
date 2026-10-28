import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RecordLink as Link, useListState } from '../common/listNavigation';
import ReceivingLayout, { ErrorMessage } from './ReceivingLayout';
import { receivingApi } from './receivingApi';
import { inDateRange, recordDate, SortControls, SortHeader, sortRecords } from './listTable';

const EMPTY_FILTERS = { company: '', code: '', recorded: '', from: '', to: '' };
const COLUMNS = [
  { key: 'TrackingNumber', label: 'Tracking #' }, { key: 'Company', label: 'Company' },
  { key: 'Code', label: 'Code' }, { key: 'OrderNumber', label: 'Order #' },
  { key: 'CreationDateTime', label: 'Received', value: item => recordDate(item.CreationDateTime) },
  { key: 'Recorded', label: 'Recorded', value: item => Number(!!item.Recorded) },
];

export default function LegacyReceivingList() {
  const [items, setItems] = useState([]);
  const [search, setSearch] = useListState('search', '');
  const [filters, setFilters] = useListState('filters', EMPTY_FILTERS);
  const [sort, setSort] = useListState('sort', { key: 'CreationDateTime', direction: 'desc' });
  const [page, setPage] = useListState('page', 1);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const data = await receivingApi('/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ recorded: ['recorded', 'not_recorded'] }) });
      setItems(data);
      setFilters(previous => ({ ...previous,
        company: data.some(item => item.Company === previous.company) ? previous.company : '',
        code: data.some(item => item.Code === previous.code) ? previous.code : '',
      }));
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [setFilters]);
  useEffect(() => { load(); window.addEventListener('focus', load); return () => window.removeEventListener('focus', load); }, [load]);
  // The server applies the current department company grants to every record.
  const scope = items;
  const options = key => [...new Set(scope.map(item => item[key]).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const invalidDates = !!(filters.from && filters.to && filters.from > filters.to);
  const visible = useMemo(() => sortRecords(scope.filter(item =>
    [item.TrackingNumber, item.Company, item.Code, item.OrderNumber, item.Remark].join(' ').toLowerCase().includes(search.trim().toLowerCase()) &&
    (!filters.company || item.Company === filters.company) && (!filters.code || item.Code === filters.code) &&
    (!filters.recorded || (filters.recorded === 'yes' ? !!item.Recorded : !item.Recorded)) &&
    inDateRange(item.CreationDateTime, filters.from, filters.to)
  ), sort, COLUMNS), [scope, search, filters, sort]);
  const update = (key, value) => { setFilters(previous => ({ ...previous, [key]: value })); setPage(1); };
  const changeSort = value => { setSort(value); setPage(1); };
  const pages = Math.max(1, Math.ceil(visible.length / 50));
  const currentPage = Math.min(page, pages);
  return <ReceivingLayout title="Previous receiving records" subtitle="Historical receiving data only. New receipts are listed separately in Returns.">
    <ErrorMessage message={error} onClose={() => setError('')} />
    <section className="receiving-card" aria-label="Previous record filters"><div className="receiving-grid">
      <label>Search previous records<input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Tracking, company, code, order, or notes" /></label>
      <label>Company<select value={filters.company} onChange={e => update('company', e.target.value)}><option value="">All companies</option>{options('Company').map(value => <option key={value}>{value}</option>)}</select></label>
      <label>Code<select value={filters.code} onChange={e => update('code', e.target.value)}><option value="">All codes</option>{options('Code').map(value => <option key={value}>{value}</option>)}</select></label>
      <label>Recorded status<select value={filters.recorded} onChange={e => update('recorded', e.target.value)}><option value="">All records</option><option value="yes">Recorded</option><option value="no">Not recorded</option></select></label>
      <label>Received from<input type="date" value={filters.from} max={filters.to || undefined} onChange={e => update('from', e.target.value)} /></label>
      <label>Received to<input type="date" value={filters.to} min={filters.from || undefined} onChange={e => update('to', e.target.value)} /></label>
    </div><div className="receiving-actions"><button className="secondary" onClick={load} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</button><button className="secondary" onClick={() => { setSearch(''); setFilters(EMPTY_FILTERS); setPage(1); }}>Clear filters</button><span className="receiving-muted" role="status">{visible.length} of {scope.length} records</span></div>
      {invalidDates && <p role="alert" className="receiving-filter-error">Received to must be on or after Received from.</p>}
    </section>
    <SortControls columns={COLUMNS} sort={sort} onChange={changeSort} />
    <div className="receiving-table-wrap"><table className="receiving-table" aria-label="Previous receiving records"><thead><tr>{COLUMNS.map(column => <SortHeader key={column.key} column={column} sort={sort} onChange={changeSort} />)}</tr></thead><tbody>{visible.slice((currentPage - 1) * 50, currentPage * 50).map(item => <tr key={item.id || item.TrackingNumber}><td><Link to={'/return/legacy/' + encodeURIComponent(item.TrackingNumber)}>{item.TrackingNumber}</Link></td><td>{item.Company || '—'}</td><td>{item.Code || '—'}</td><td>{item.OrderNumber || '—'}</td><td>{recordDate(item.CreationDateTime) || '—'}</td><td>{item.Recorded ? 'Yes' : 'No'}</td></tr>)}</tbody></table>{!visible.length && <p className="receiving-empty">{loading ? 'Loading previous records…' : error ? 'Records could not be loaded. Use Refresh to retry.' : 'No previous records match these filters.'}</p>}</div>
    <div className="receiving-pagination"><span>Page {currentPage} of {pages} · Up to 50 records per page</span><div className="flex gap-2"><button className="secondary" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</button><button className="secondary" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>Next</button></div></div>
  </ReceivingLayout>;
}
