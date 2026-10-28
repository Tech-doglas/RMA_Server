import React, { useState } from 'react';

export default function PalletField({ value, onChange, pallets, disabled = false }) {
  const [creating, setCreating] = useState(false);
  const known = pallets.some(row => row.pallet === value);
  const custom = creating || (!!value && !known);
  return <div>
    <label>Pallet<select disabled={disabled} value={custom ? 'new' : value ? 'existing:' + value : ''} onChange={event => {
      if (event.target.value === 'new') { setCreating(true); onChange(''); }
      else { setCreating(false); onChange(event.target.value.replace(/^existing:/, '')); }
    }}><option value="">Unassigned</option>{pallets.map(row => <option key={row.pallet} disabled={['LOCKED', 'FULL'].includes(row.status)} value={'existing:' + row.pallet}>{row.pallet} · {row.total} unshipped units{row.status && row.status !== 'OPEN' ? ' · ' + (row.status === 'FULL' ? 'Full' : 'Locked') : ''}</option>)}<option value="new">Enter a new pallet</option></select></label>
    {custom && <label className="mt-3">Pallet name<input disabled={disabled} value={value} maxLength={255} placeholder="e.g., P-001" onChange={event => onChange(event.target.value)} required={creating} /></label>}
    <p className="receiving-muted mt-2">Choose an open pallet or enter a new pallet name. Locked and full pallets cannot receive more units.</p>
  </div>;
}
