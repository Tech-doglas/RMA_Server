import React, { useEffect, useRef, useState } from 'react';
import { RecordLink as Link, useListState } from '../common/listNavigation';
import ReceivingLayout, { SuccessMessage, ErrorMessage, Status } from './ReceivingLayout';
import { receivingApi, receivingAuth } from './receivingApi';
import AdminPasswordSettings from './AdminPasswordSettings';
import DepartmentSettings from './DepartmentSettings';
import { authApi, canPermission } from '../common/access';

const send = (path, method, payload) => receivingApi(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
function Feedback({ error, notice, clearError, clearNotice }) { return <><ErrorMessage message={error} onClose={clearError} /><SuccessMessage message={notice} onClose={clearNotice} /></>; }
function Pager({ page, total, size = 25, change, busy = false }) {
  return <div className="receiving-pagination"><span>{total} record(s) · Page {page} of {Math.max(1, Math.ceil(total / size))}</span><div className="receiving-actions"><button disabled={busy || page <= 1} onClick={() => change(page - 1)}>Previous</button><button disabled={busy || page * size >= total} onClick={() => change(page + 1)}>Next</button></div></div>;
}
function Overview({ open }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => { let active = true; receivingApi('/admin/overview').then(value => { if (active) setData(value); }).catch(err => { if (active) setError(err.message); }); return () => { active = false; }; }, [revision]);
  return <><ErrorMessage message={error} onClose={() => setError('')} />{data && <><div className="receiving-grid admin-stats">
    {[['received', 'Total returns'], ['awaitingInspection', 'Awaiting inspection'], ['readyToShip', 'Ready to ship'], ['shipped', 'Shipped'], ['pallets', 'Pallets'], ['activeAccounts', 'Active accounts'], ['pendingRegistrations', 'Pending registrations'], ['removedRecords', 'Removed records']].map(([key, label]) => <div className="receiving-card" key={key}><p className="receiving-muted">{label}</p><strong>{data.totals[key] || 0}</strong></div>)}
  </div><section className="receiving-card"><h2>Admin actions</h2><div className="receiving-actions"><Link className="receiving-button" to="/return/manage">Manage 3PL records</Link><button onClick={() => open('Accounts')}>Manage accounts</button><button onClick={() => open('History')}>View history and restore</button><Link to="/return/ship">Prepare shipments</Link><Link to="/return/report">Monthly reporting</Link></div></section>
  <section className="receiving-card"><h2>Returns by bulk type</h2><div className="receiving-table-wrap"><table className="receiving-table"><thead><tr><th>Type</th><th>Units</th></tr></thead><tbody>{data.typeUsage.map(row => <tr key={row.bulkType}><td>{row.bulkType}</td><td>{row.total}</td></tr>)}</tbody></table></div><div className="receiving-actions"><button className="secondary" onClick={() => setRevision(revision + 1)}>Refresh overview</button></div></section></>}</>;
}

function Records() {
  const [filters, setFilters] = useListState('filters', { q: '', status: '', bulkType: '', company: '', pallet: '', from: '', to: '' });
  const [applied, setApplied] = useListState('applied', filters);
  const [page, setPage] = useListState('page', 1);
  const [data, setData] = useState({ items: [], total: 0 });
  const [types, setTypes] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [selected, setSelected] = useState([]);
  const [action, setAction] = useState(canPermission('return.classify') ? 'type' : canPermission('return.inspect') ? 'pallet' : 'remove');
  const [value, setValue] = useState('REGULAR');
  const [confirmation, setConfirmation] = useState('');
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => { receivingApi('/admin/types').then(result => setTypes(result.bulkTypes)).catch(err => setError(err.message)); }, []);
  useEffect(() => {
    const refresh = () => setRevision(previous => previous + 1);
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, []);
  useEffect(() => {
    let active = true; setBusy(true); setError(''); setSelected([]); setConfirmation('');
    receivingApi('/admin/records?' + new URLSearchParams({ ...applied, page })).then(result => {
      if (!active) return;
      setData(result);
      const options = [...new Set([...(result.companies || []), ...result.items.map(item => item.company).filter(Boolean)])].sort();
      setCompanies(options);
      setFilters(previous => !previous.company || options.includes(previous.company) ? previous : { ...previous, company: '' });
      if (applied.company && !options.includes(applied.company)) { setApplied(previous => ({ ...previous, company: '' })); setPage(1); }
    }).catch(err => { if (active) setError(err.message); }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [applied, page, revision, setApplied, setFilters, setPage]);
  async function bulk(e) {
    e.preventDefault(); setBusy(true); setError(''); setNotice('');
    try { const result = await send('/admin/bulk', 'POST', { unitIds: selected, action, value, confirmation }); setNotice(result.message); setRevision(revision + 1); }
    catch (err) { setError(err.message); setBusy(false); }
  }
  const toggle = id => setSelected(selected.includes(id) ? selected.filter(value => value !== id) : [...selected, id]);
  return <><Feedback error={error} notice={notice} clearError={() => setError('')} clearNotice={() => setNotice('')} /><section className="receiving-card"><h2>Search returns</h2><form onSubmit={e => { e.preventDefault(); setPage(1); setApplied({ ...filters }); }}><fieldset disabled={busy}><div className="receiving-grid">
    <label>Search<input value={filters.q} onChange={e => setFilters({ ...filters, q: e.target.value })} placeholder="File Number, tracking, UPC/Item code, serial, item code/name…" /></label>
    <label>Status<select value={filters.status} onChange={e => setFilters({ ...filters, status: e.target.value })}><option value="">All statuses</option><option value="awaiting">Awaiting inspection</option><option value="ready">Ready to ship</option><option value="shipped">Shipped</option></select></label>
    <label>Bulk type filter<select value={filters.bulkType} onChange={e => setFilters({ ...filters, bulkType: e.target.value })}><option value="">All types</option>{types.map(type => <option key={type}>{type}</option>)}</select></label>
    <label>Company<select value={filters.company} onChange={e => setFilters({ ...filters, company: e.target.value })}><option value="">All companies</option>{companies.map(company => <option key={company}>{company}</option>)}</select></label>
    {['pallet', 'from', 'to'].map(key => <label key={key}>{({ pallet: 'Pallet', from: 'Received from', to: 'Received to' })[key]}<input type={['from', 'to'].includes(key) ? 'date' : 'text'} value={filters[key]} onChange={e => setFilters({ ...filters, [key]: e.target.value })} /></label>)}
  </div><div className="receiving-actions"><button type="submit">Search returns</button><button type="button" className="secondary" onClick={() => { const empty = Object.fromEntries(Object.keys(filters).map(key => [key, ''])); setFilters(empty); setApplied(empty); setPage(1); }}>Clear filters</button></div></fieldset></form></section>
  <section className="receiving-card"><h2>Returns · {data.total}</h2>{busy && <p role="status">Loading…</p>}<div className="receiving-table-wrap"><table className="receiving-table admin-mobile-table admin-record-table"><thead><tr><th><input aria-label="Select all records on this page" type="checkbox" disabled={busy || !data.items.length} checked={!!data.items.length && selected.length === data.items.length} onChange={e => setSelected(e.target.checked ? data.items.map(item => item.id) : [])} /></th><th>File Number</th><th>Tracking</th><th>Item code/name</th><th>Received</th><th>Type</th><th>Pallet</th><th>Status</th><th>Actions</th></tr></thead><tbody>{data.items.map(item => <tr key={item.id}><td data-label="Select unit"><input aria-label={'Select ' + item.fileNo} type="checkbox" disabled={busy} checked={selected.includes(item.id)} onChange={() => toggle(item.id)} /></td><td data-label="File Number"><Link to={'/return/' + item.fileNo}>{item.fileNo}</Link></td><td>{item.tracking || '—'}</td><td data-label="Item code/name">{item.laptop}</td><td data-label="Received">{item.receivedDate}</td><td data-label="Type">{item.bulkType}</td><td>{item.pallet || '—'}</td><td data-label="Status"><Status item={item} /></td><td data-label="Actions">{(canPermission('return.edit') || canPermission('return.delete')) && <Link to={'/return/admin/' + item.fileNo}>Edit / remove</Link>}</td></tr>)}</tbody></table></div>{!busy && !data.items.length && <p className="receiving-empty">No matching returns.</p>}<Pager page={page} total={data.total} change={setPage} busy={busy} />
  {['return.classify', 'return.inspect', 'return.delete'].some(canPermission) && <form onSubmit={bulk} className="mt-5"><fieldset disabled={busy || !selected.length}><h3>{selected.length} selected</h3><div className="receiving-grid mt-5"><label>Bulk action<select value={action} onChange={e => { setAction(e.target.value); setValue(e.target.value === 'type' ? 'REGULAR' : ''); setConfirmation(''); }}>{canPermission('return.classify') && <option value="type">Change bulk type</option>}{canPermission('return.inspect') && <option value="pallet">Assign pallet</option>}{canPermission('return.delete') && <option value="remove">Remove selected records</option>}</select></label>
    {action === 'type' && <label>New bulk type<select value={value} onChange={e => setValue(e.target.value)}>{types.map(type => <option key={type}>{type}</option>)}</select></label>}
    {action === 'pallet' && <label>New pallet<input value={value} onChange={e => setValue(e.target.value)} maxLength={255} placeholder="Leave blank to unassign" /></label>}
    {action === 'remove' && <label>Type REMOVE {selected.length} to confirm<input value={confirmation} onChange={e => setConfirmation(e.target.value)} /></label>}
  </div><p className="receiving-muted mt-5">{action === 'type' ? 'Type changes also include other units sharing the selected tracking numbers.' : action === 'pallet' ? 'Shipped units cannot move to another pallet.' : 'Removed records can be restored from History.'}</p><div className="receiving-actions"><button type="submit" className={action === 'remove' ? 'danger' : ''} disabled={action === 'remove' && confirmation !== 'REMOVE ' + selected.length}>Apply to selected</button></div></fieldset></form>}</section></>;
}

const blankAccount = { username: '', role: 'normal', department: 'IT', isActive: true, password: '' };
function Accounts() {
  const [departments, setDepartments] = useState([]);
  useEffect(() => { authApi('/departments').then(data => setDepartments(data.departments)).catch(() => {}); }, []);
  const accountForm = useRef(null);
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ ...blankAccount });
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState('');
  const [accountFilter, setAccountFilter] = useState('all');
  const [statusTarget, setStatusTarget] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => { receivingApi('/admin/users').then(data => setUsers(data.users)).catch(err => setError(err.message)); }, []);
  async function save(e) {
    e.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      const result = await send('/admin/users', editing ? 'PATCH' : 'POST', form);
      setUsers(result.users); setForm({ ...blankAccount }); setEditing(false); setNotice(result.message);
      if (form.username === receivingAuth().username && form.password) { localStorage.removeItem('auth'); window.location.assign('/'); }
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  async function approve(username, decision) {
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await send('/admin/users/approval', 'POST', { username, decision });
      setUsers(result.users); setNotice(result.message);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  async function changeStatus() {
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await send('/admin/users', 'PATCH', { username: statusTarget.username, role: statusTarget.role, department: statusTarget.department, isActive: !statusTarget.isActive, password: '' });
      setUsers(result.users); setNotice(statusTarget.isActive ? 'Account disabled. Login is blocked.' : 'Account enabled.');
      if (editing && form.username === statusTarget.username) setForm({ ...form, isActive: !statusTarget.isActive });
      setStatusTarget(null);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  function editAccount(user) {
    setEditing(true); setForm({ ...user, isActive: !!user.isActive, password: '' }); setNotice(''); setStatusTarget(null);
    accountForm.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }
  return <><Feedback error={error} notice={notice} clearError={() => setError('')} clearNotice={() => setNotice('')} /><section className="receiving-card" ref={accountForm}><h2>{editing ? 'Edit account' : 'Create account'}</h2><form onSubmit={save}><fieldset disabled={busy}><div className="receiving-grid">
    <label>Username<input required maxLength={255} readOnly={editing} value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} autoComplete="off" /></label>
    <label>Role<select disabled={editing && form.username.toLowerCase() === 'admin'} value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}><option value="normal">Staff</option><option value="manager">Manager</option><option value="admin">Admin</option></select></label>
    <label>Department<select required value={form.department} onChange={e => setForm({ ...form, department: e.target.value })}><option value="">Choose department</option>{[...new Set([...departments, ...users.map(user => user.department), form.department].filter(Boolean))].map(value => <option key={value}>{value}</option>)}</select></label>
    <label>{editing ? 'Reset password (optional)' : 'Initial password'}<input type="password" required={!editing} minLength={12} maxLength={255} autoComplete="new-password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} /></label>
    <label>Account status<select disabled={editing && form.username.toLowerCase() === 'admin'} value={form.isActive ? 'active' : 'disabled'} onChange={e => setForm({ ...form, isActive: e.target.value === 'active' })}><option value="active">Active</option><option value="disabled">Disabled</option></select></label>
  </div><p className="receiving-muted mt-5">Accounts created here are approved by you. Public registrations wait for approval below. Editing a pending account does not approve it. Disabled accounts cannot log in. The account named admin always keeps its Admin role and Active status.</p><div className="receiving-actions"><button type="submit">{editing ? 'Save account' : 'Create account'}</button>{editing && <button type="button" className="secondary" onClick={() => { setForm({ ...blankAccount }); setEditing(false); }}>Cancel editing</button>}</div></fieldset></form></section>
  <section className="receiving-card"><h2>Accounts · {users.length}</h2><p className="receiving-muted mb-4">{users.filter(user => user.approvalStatus === 'pending').length} registration(s) waiting for your approval.</p><div className="receiving-grid"><label>Search accounts<input value={query} onChange={e => setQuery(e.target.value)} /></label><label>Registration filter<select value={accountFilter} onChange={e => setAccountFilter(e.target.value)}><option value="all">All accounts</option><option value="pending">Pending approval</option><option value="approved">Approved</option><option value="rejected">Rejected</option></select></label></div><div className="receiving-table-wrap mt-5"><table className="receiving-table admin-mobile-table"><thead><tr><th>Username</th><th>Role</th><th>Department</th><th>Status</th><th>Actions</th></tr></thead><tbody>{users.filter(user => [user.username, user.role, user.department].join(' ').toLowerCase().includes(query.toLowerCase()) && (accountFilter === 'all' || (user.approvalStatus || 'approved') === accountFilter)).map(user => <tr key={user.username}><td data-label="Username">{user.username}</td><td data-label="Role">{user.role === 'normal' ? 'Staff' : user.role}</td><td data-label="Department">{user.department}</td><td data-label="Status">{user.approvalStatus === 'pending' ? 'Pending approval' : user.approvalStatus === 'rejected' ? 'Rejected' : user.isActive ? 'Active' : 'Disabled'}</td><td data-label="Actions"><div className="receiving-actions" style={{ marginTop: 0 }}>{['pending', 'rejected'].includes(user.approvalStatus) && <button disabled={busy} onClick={() => approve(user.username, 'approve')}>Approve {user.username}</button>}{user.approvalStatus === 'pending' && <button className="danger" disabled={busy} onClick={() => approve(user.username, 'reject')}>Reject {user.username}</button>}<button className="secondary" disabled={busy} onClick={() => editAccount(user)}>{user.username.toLowerCase() === 'admin' ? 'Edit admin account' : 'Change role ' + user.username}</button>{(!user.approvalStatus || user.approvalStatus === 'approved') && <button className={user.isActive ? 'danger' : 'secondary'} disabled={busy || user.username.toLowerCase() === 'admin' || user.username.toLowerCase() === (receivingAuth().username || '').toLowerCase()} onClick={() => setStatusTarget(user)}>{user.isActive ? 'Disable' : 'Enable'} account {user.username}</button>}{statusTarget?.username === user.username && <div><p className="receiving-muted">{user.isActive ? 'This account will be blocked from login.' : 'This account will be able to log in again.'}</p><div className="receiving-actions"><button disabled={busy} className={user.isActive ? 'danger' : ''} onClick={changeStatus}>Confirm {user.isActive ? 'disable' : 'enable'} {user.username}</button><button className="secondary" disabled={busy} onClick={() => setStatusTarget(null)}>Cancel status change</button></div></div>}</div></td></tr>)}</tbody></table></div></section></>;
}

function History({ removedOnly = false }) {
  const [removed, setRemoved] = useState(removedOnly);
  const [filter, setFilter] = useState({ username: '', action: '', target: '' });
  const [applied, setApplied] = useState(filter);
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], total: 0 });
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    let active = true; setBusy(true); setError('');
    receivingApi((removed ? '/admin/trash?' : '/admin/history?') + new URLSearchParams({ ...applied, page })).then(result => { if (active) setData(result); }).catch(err => { if (active) setError(err.message); }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [removed, page, applied, revision]);
  async function restore(id) {
    setBusy(true); setError(''); setNotice('');
    try { const result = await send('/admin/restore/' + id, 'POST', {}); setNotice(result.message); setRevision(revision + 1); }
    catch (err) { setError(err.message); setBusy(false); }
  }
  return <><Feedback error={error} notice={notice} clearError={() => setError('')} clearNotice={() => setNotice('')} /><section className="receiving-card"><h2>History and removed records</h2><div className="receiving-actions">{!removedOnly && <button className={!removed ? '' : 'secondary'} onClick={() => { setRemoved(false); setPage(1); }}>All history</button>}<button className={removed ? '' : 'secondary'} onClick={() => { setRemoved(true); setPage(1); }}>Removed records</button></div>
  {!removed && <form className="mt-5" onSubmit={e => { e.preventDefault(); setApplied({ ...filter }); setPage(1); }}><div className="receiving-grid">{[['username', 'Staff username'], ['action', 'Action'], ['target', 'Record ID or type name']].map(([key, label]) => <label key={key}>{label}<input value={filter[key]} onChange={e => setFilter({ ...filter, [key]: e.target.value })} placeholder={key === 'action' ? 'e.g., edit unit' : ''} /></label>)}</div><div className="receiving-actions"><button type="submit">Filter history</button><button type="button" className="secondary" onClick={() => { setFilter({ username: '', action: '', target: '' }); setApplied({ username: '', action: '', target: '' }); setPage(1); }}>Clear history filters</button></div></form>}
  <p className="receiving-muted mt-5 mb-4">{removed ? 'Restore the latest removed version with its original ID, File Number and photo links. Serial conflicts must be resolved first.' : 'Admin actions show who changed the data and when. Expand a row to see its saved details.'}</p>
  {busy && <p role="status">Loading…</p>}<div className="receiving-table-wrap"><table className="receiving-table admin-mobile-table"><thead><tr><th>Date</th><th>Admin</th><th>Action</th><th>Record / target</th><th>Details</th>{removed && <th>Restore</th>}</tr></thead><tbody>{data.items.map(event => <tr key={event.id}><td data-label="Date">{event.timestamp}</td><td data-label="Admin">{event.username}</td><td data-label="Action">{event.action}</td><td data-label="Record / target">{event.snapshot.fileNo || event.target}</td><td data-label="Details"><details><summary>View saved details</summary><pre className="admin-history-details">{JSON.stringify(event.snapshot, null, 2)}</pre></details></td>{removed && <td data-label="Restore"><button disabled={busy} onClick={() => restore(event.id)}>Restore {event.snapshot.fileNo}</button></td>}</tr>)}</tbody></table></div>{!busy && !data.items.length && <p className="receiving-empty">No records here.</p>}<Pager page={page} total={data.total} change={setPage} busy={busy} /></section></>;
}

function DataTools() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  function download(content, filename, mime) {
    const url = URL.createObjectURL(new Blob([content], { type: mime }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url);
  }
  async function run(kind) {
    setBusy(true); setError(''); setNotice('');
    try {
      if (kind === 'backup') { const result = await send('/admin/backup', 'POST', {}); setNotice(result.message + ' File: ' + result.filename); }
      else {
        const result = await receivingApi('/admin/export');
        if (kind === 'json') download(JSON.stringify(result, null, 2), 'return-records.json', 'application/json');
        else {
          const fields = ['fileNo', 'tracking', 'laptop', 'upc', 'itemName', 'itemInfo', 'company', 'receivedDate', 'inspectionDate', 'serial', 'pallet', 'shipDate', 'shipBatch', 'bulkType', 'remark', 'inspectionRemark'];
          const cell = value => {
            let text = String(value ?? '');
            if (typeof value === 'string' && (/^\s*[=+@-]/.test(text) || /^[\t\r\n]/.test(text))) text = "'" + text;
            return '"' + text.replace(/"/g, '""') + '"';
          };
          download('\uFEFF' + [fields.map(cell).join(','), ...result.units.map(item => fields.map(field => cell(item[field])).join(','))].join('\r\n'), 'return-records.csv', 'text/csv;charset=utf-8');
        }
        setNotice(result.units.length + ' return records exported.');
      }
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return <><Feedback error={error} notice={notice} clearError={() => setError('')} clearNotice={() => setNotice('')} /><section className="receiving-card"><h2>Export return records</h2><p className="receiving-muted">Download all current returns as CSV for spreadsheets or JSON with individual photo links and grouping details. Exports exclude account passwords.</p><div className="receiving-actions"><button disabled={busy} onClick={() => run('csv')}>Export CSV</button><button disabled={busy} onClick={() => run('json')}>Export JSON</button><Link to="/return/report">Monthly report</Link></div></section>
  {canPermission('admin') && <section className="receiving-card"><h2>Database backup</h2><p className="receiving-muted">Save a consistent copy of the local database in the server’s storage/backups folder. It includes accounts and admin history. Photos live separately in storage/images; copy the full storage folder to preserve them too.</p><div className="receiving-actions"><button disabled={busy} onClick={() => run('backup')}>Create database backup</button></div></section>}</>;
}

export function ReturnReceivingManage() {
  return <ReceivingLayout title="Manage 3PL records" subtitle="Search, edit, and remove return records"><Records />{canPermission('return.restore') && <History removedOnly />}{canPermission('return.export') && <DataTools />}</ReceivingLayout>;
}

export default function ReturnReceivingAdminConsole() {
  const [tab, setTab] = useState('Overview');
  const tabs = ['Overview', 'Departments & permissions', 'Accounts', 'History', 'Export & backup'];
  return <main className="receiving admin-page">
    <div className="receiving-title"><h1>Administration</h1><p>Manage accounts, departments, permissions, history, and backups.</p></div>
    <div className="admin-tabs" role="tablist" aria-label="Admin sections">{tabs.map(name => <button key={name} role="tab" aria-selected={tab === name} aria-controls="admin-panel" onClick={() => setTab(name)} className={tab === name ? '' : 'secondary'}>{name}</button>)}</div>
    <div id="admin-panel" role="tabpanel" aria-label={tab}>{tab === 'Overview' ? <Overview open={setTab} /> : tab === 'Departments & permissions' ? <DepartmentSettings /> : tab === 'Accounts' ? <><Accounts /><AdminPasswordSettings /></> : tab === 'History' ? <History /> : <DataTools />}</div>
  </main>;
}
