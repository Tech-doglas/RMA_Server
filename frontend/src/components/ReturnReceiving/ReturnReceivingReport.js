import React, { useCallback, useEffect, useState } from 'react';
import ReceivingLayout, { ErrorMessage } from './ReceivingLayout';
import { receivingApi } from './receivingApi';

export default function ReturnReceivingReport() {
  const [report, setReport] = useState({ months: [], totals: {} });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setReport(await receivingApi('/monthly-report')); }
    catch (err) { setError(err.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  function download() {
    const csv = ['Month,Received,Inspected,Shipped', ...report.months.map(row => [row.month, row.received, row.inspected, row.shipped].join(',')), ['Total', report.totals.received, report.totals.inspected, report.totals.shipped].join(',')].join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a'); link.href = url; link.download = 'return-monthly-report.csv'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <ReceivingLayout title="Monthly report" subtitle="Each unit counts in the month it was received, inspected, and shipped.">
    {report.pendingQuantity > 0 && <p className="receiving-card">{report.pendingQuantity} historical receiving records still need quantity confirmation. The totals below include confirmed units only.</p>}
    <ErrorMessage message={error} onClose={() => setError('')} /><div className="receiving-stats">{['received', 'inspected', 'shipped'].map(key => <div className="receiving-stat" key={key}><span>Total {key}</span><strong>{loading ? '—' : report.totals[key] || 0}</strong></div>)}</div>
    <div className="receiving-table-wrap"><table className="receiving-table"><thead><tr><th>Month</th><th>Received</th><th>Inspected</th><th>Shipped</th></tr></thead><tbody>{report.months.map(row => <tr key={row.month}><td>{row.month}</td><td>{row.received}</td><td>{row.inspected}</td><td>{row.shipped}</td></tr>)}</tbody></table>{!report.months.length && <p className="receiving-empty">{loading ? 'Loading report…' : 'No receiving activity yet.'}</p>}</div>
    <div className="receiving-actions"><button onClick={download} disabled={loading || !report.months.length}>Download CSV</button><button className="secondary" onClick={load} disabled={loading}>Refresh</button><button className="secondary" onClick={() => window.print()}>Print report</button></div>
  </ReceivingLayout>;
}

