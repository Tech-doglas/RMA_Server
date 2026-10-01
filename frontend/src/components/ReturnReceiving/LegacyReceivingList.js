import React, { useEffect, useState } from 'react';
import { RecordLink as Link, useListState } from '../common/listNavigation';
import ReceivingLayout, { ErrorMessage } from './ReceivingLayout';
import { receivingApi } from './receivingApi';
export default function LegacyReceivingList({ department }) {
  const [items, setItems] = useState([]);
  const [search, setSearch] = useListState('search', '');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    receivingApi('/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ recorded: ['recorded', 'not_recorded'] }) })
      .then(setItems).catch(err => setError(err.message)).finally(() => setLoading(false));
  }, []);
  const visible = items.filter(item => (department !== 'SnowBell' || item.Company === 'SNOWBELL/XIE/PITY TECH') && [item.TrackingNumber, item.Company, item.Code, item.OrderNumber].join(' ').toLowerCase().includes(search.toLowerCase()));
  return <ReceivingLayout title="Previous receiving records" subtitle="Records from the earlier receiving workflow. New deliveries are recorded in Returns.">
    <ErrorMessage message={error} /><section className="receiving-card"><label>Search previous records<input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tracking, company, code, or order" /></label></section>
    <div className="receiving-table-wrap"><table className="receiving-table"><thead><tr><th>Tracking #</th><th>Company</th><th>Code</th><th>Order #</th><th>Recorded</th></tr></thead><tbody>{visible.map(item => <tr key={item.TrackingNumber}><td><Link to={'/return/legacy/' + encodeURIComponent(item.TrackingNumber)}>{item.TrackingNumber}</Link></td><td>{item.Company}</td><td>{item.Code}</td><td>{item.OrderNumber || '—'}</td><td>{item.Recorded ? 'Yes' : 'No'}</td></tr>)}</tbody></table>{!visible.length && <p className="receiving-empty">{loading ? 'Loading previous records…' : 'No previous records found.'}</p>}</div>
  </ReceivingLayout>;
}

