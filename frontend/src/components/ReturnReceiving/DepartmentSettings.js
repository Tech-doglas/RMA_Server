import React, { useEffect, useState } from 'react';
import { receivingApi } from './receivingApi';
import { SuccessMessage, ErrorMessage } from './ReceivingLayout';
import { actionHelp, includedViewingPermissions, permissionKind, viewingDependencies } from './permissionPresentation';

const PERMISSION_TYPES = {
  view: { title: 'View only', description: 'Read information. No changes to records.' },
  update: { title: 'Create & update', description: 'Add records or change data, status, and shipments.' },
  delete: { title: 'Delete', description: 'Remove records. Give this access only when needed.' },
  download: { title: 'Download / print', description: 'Make a copy of data. No changes to records.' },
};

function PermissionSection({ kind, group, actions, enabled, included, required, onToggle }) {
  if (!actions.length) return null;
  const info = PERMISSION_TYPES[kind];
  return <section className={'permission-section permission-section-' + kind} aria-label={group + ' — ' + info.title}>
    <div className="permission-section-heading"><h3>{info.title}</h3><span>{actions.filter(action => enabled.has(action.key) || included.has(action.key)).length} / {actions.length} enabled</span></div>
    <p className="permission-section-description">{info.description}</p>
    <div className="permission-choices">{actions.map(action => {
      const checked = enabled.has(action.key);
      const dependency = required.has(action.key);
      const inherited = !checked && included.has(action.key);
      const id = 'permission-' + action.key.replace(/\./g, '-');
      return <label className={'permission-choice' + (checked || inherited ? ' is-enabled' : '')} key={action.key}>
        <input type="checkbox" aria-label={action.label} aria-describedby={id + '-help'} checked={checked} disabled={dependency} onChange={event => onToggle(action.key, event.target.checked)} />
        <span className="permission-choice-copy"><span className="permission-choice-name">{action.label}</span><span id={id + '-help'} className="permission-choice-help">{actionHelp(action)}{dependency && <strong> Required by another enabled permission.</strong>}{inherited && <strong> Included through shipping or pallet management. Check to allow this view independently.</strong>}</span></span>
        <span className="permission-choice-state" aria-hidden="true">{dependency ? 'Required' : inherited ? 'Included' : checked ? 'Allowed' : 'Off'}</span>
      </label>;
    })}</div>
  </section>;
}

export default function DepartmentSettings() {
  const [data, setData] = useState({ departments: [], catalog: [] });
  const [selected, setSelected] = useState('');
  const [name, setName] = useState('');
  const [newName, setNewName] = useState('');
  const [permissions, setPermissions] = useState([]);
  const [companySelection, setCompanySelection] = useState([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [removing, setRemoving] = useState(false);
  const [search, setSearch] = useState('');
  const required = viewingDependencies(permissions, data.catalog);
  const effective = [...new Set([...permissions, ...required])];
  const enabled = new Set(effective);
  const included = includedViewingPermissions(effective);
  const saved = data.departments.find(row => row.name === selected)?.permissions || [];
  const savedEffective = [...new Set([...saved, ...viewingDependencies(saved, data.catalog)])];
  const savedCompanies = data.departments.find(row => row.name === selected)?.companies || [];
  const dirty = !!selected && (JSON.stringify([...companySelection].sort()) !== JSON.stringify([...savedCompanies].sort()) || name !== selected || JSON.stringify([...effective].sort()) !== JSON.stringify(savedEffective.sort()));
  useEffect(() => { receivingApi('/admin/departments').then(setData).catch(err => setError(err.message)).finally(() => setBusy(false)); }, []);
  const choose = value => {
    if (dirty && !window.confirm('Discard unsaved permission changes and switch departments?')) return;
    const department = data.departments.find(row => row.name === value);
    setSelected(value); setName(value); setPermissions(department?.permissions || []); setCompanySelection(department?.companies || []); setRemoving(false); setNotice(''); setSearch('');
  };
  async function save(method, payload) {
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await receivingApi('/admin/departments', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      setData(result); setNotice(result.message); setRemoving(false);
      const value = method === 'DELETE' ? '' : method === 'POST' ? payload.name.trim() : payload.newName.trim();
      const department = result.departments.find(row => row.name === value);
      setSelected(value); setName(value); setPermissions(department?.permissions || []); setCompanySelection(department?.companies || []); setNewName('');
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  const groups = [...new Set(data.catalog.map(action => action.group))];
  const query = search.trim().toLowerCase();
  const matches = action => !query || [action.label, action.group, actionHelp(action), PERMISSION_TYPES[permissionKind(action)].title].join(' ').toLowerCase().includes(query);
  const toggle = (key, checked) => { setPermissions(previous => checked ? [...new Set([...previous, key])] : previous.filter(value => value !== key)); setNotice(''); };
  return <><ErrorMessage message={error} onClose={() => setError('')} /><SuccessMessage message={notice} onClose={() => setNotice('')} />
    <section className="receiving-card"><h2>Departments</h2><p className="receiving-muted mb-4">Departments control what staff and managers can do. Admin accounts always retain full access to administration and every action.</p>
      <form onSubmit={event => { event.preventDefault(); save('POST', { name: newName }); }}><fieldset disabled={busy}><label>New department<input required maxLength={255} value={newName} onChange={event => setNewName(event.target.value)} /></label><div className="receiving-actions"><button type="submit">Add department</button></div></fieldset></form>
      <label className="mt-5">Department to manage<select disabled={busy} value={selected} onChange={event => choose(event.target.value)}><option value="">Choose a department</option>{data.departments.map(row => <option key={row.name}>{row.name}</option>)}</select></label>
    </section>
    {selected && <form onSubmit={event => { event.preventDefault(); save('PATCH', { name: selected, newName: name, permissions: effective, ...(data.companies ? { companies: companySelection } : {}) }); }}><fieldset disabled={busy}>
      {data.companies && <section className="receiving-card"><h2>Company data access</h2>
        <p className="receiving-muted mb-4">Choose which companies this department can access. These limits apply to records, photos, pallets, reports, exports, and direct links. Action permissions below still control what users can do. Admin accounts retain full access.</p>
        {enabled.has('company.all') ? <p role="status">All companies are accessible. Turn off “Access all companies (internal staff only)” below to restrict this department.</p> : <>
          <div className="permission-choices">{data.companies.map(company => <label className="permission-choice" key={company}><input type="checkbox" aria-label={'Allow company ' + company} checked={companySelection.includes(company)} onChange={e => setCompanySelection(previous => e.target.checked ? [...previous, company] : previous.filter(name => name !== company))} /><span>{company}</span></label>)}</div>
          <p className="receiving-muted mt-3">{companySelection.length ? companySelection.length + ' company / companies selected.' : 'No companies assigned. This department cannot see or receive company data until you select a company and save.'}</p>
        </>}
      </section>}
      <section className="receiving-card"><h2>Permissions for {selected}</h2><label>Department name<input required maxLength={255} value={name} onChange={event => setName(event.target.value)} /></label><p className="receiving-muted mt-3">Checked permissions are allowed. Changes apply after you save. “Required” viewing access must stay on for another enabled action. “Included” access comes from another permission.</p>
        <div className="permission-summary" aria-label="Enabled permission totals">{Object.entries(PERMISSION_TYPES).map(([kind, info]) => <div key={kind} className={'permission-summary-item permission-summary-' + kind}><strong>{data.catalog.filter(action => permissionKind(action) === kind && (enabled.has(action.key) || included.has(action.key))).length}</strong><span>{info.title}</span></div>)}</div>
        <p className="permission-tip">For pallet viewing without shipping: allow <strong>View pallets and shipment details</strong> under View only, and leave <strong>Ship units</strong> off under Create & update.</p>
        <div className="receiving-actions"><button type="button" className="secondary" onClick={() => setPermissions(data.catalog.filter(action => action.key !== 'company.all' || permissions.includes('company.all')).map(action => action.key))}>Allow all actions</button><button type="button" className="secondary" onClick={() => setPermissions([])}>Clear all permissions</button></div>
        <label className="mt-5">Find a permission<input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search ship, photos, delete…" /></label>
      </section>
      {groups.map(group => {
        const actions = data.catalog.filter(action => action.group === group && matches(action));
        if (!actions.length) return null;
        const section = kind => <PermissionSection key={kind} kind={kind} group={group} actions={actions.filter(action => permissionKind(action) === kind)} enabled={enabled} included={included} required={required} onToggle={toggle} />;
        return <section key={group} className="receiving-card permission-workspace"><h2>{group}</h2><div className="permission-columns"><div>{section('view')}{section('download')}</div><div>{section('update')}{section('delete')}</div></div></section>;
      })}
      {!data.catalog.some(matches) && <p className="receiving-empty">No permissions match “{search}”. Try a different word.</p>}
      <div className={'permission-save-bar' + (dirty ? ' has-changes' : '')}><span role="status">{dirty ? 'Unsaved changes' : 'All changes saved'}</span><div className="receiving-actions"><button type="button" className="secondary" disabled={!dirty} onClick={() => { setPermissions(saved); setCompanySelection(savedCompanies); setName(selected); setNotice(''); }}>Discard changes</button><button type="submit" disabled={!dirty}>{busy ? 'Saving…' : 'Save department permissions'}</button></div></div>
      <div className="receiving-actions"><button type="button" className="secondary" onClick={() => setRemoving(!removing)}>{removing ? 'Cancel removal' : 'Remove department'}</button></div>
      {removing && <section className="receiving-card mt-5"><p>Remove {selected}? Accounts must be moved to another department first.</p><div className="receiving-actions"><button type="button" className="danger" onClick={() => save('DELETE', { name: selected })}>Confirm remove department</button></div></section>}
    </fieldset></form>}
  </>;
}
