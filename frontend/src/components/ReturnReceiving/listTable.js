import React from 'react';

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

// Flask serializes legacy dates as HTTP dates; newer endpoints return ISO dates.
export function recordDate(value) {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

export function inDateRange(value, from, to) {
  const day = recordDate(value);
  return (!from && !to) || (!!day && (!from || day >= from) && (!to || day <= to));
}

export function sortRecords(items, sort, columns) {
  const column = columns.find(item => item.key === sort.key) || columns[0];
  const value = column.value || (item => item[column.key]);
  return [...items].sort((a, b) => {
    const left = value(a), right = value(b);
    const emptyLeft = left === null || left === undefined || left === '';
    const emptyRight = right === null || right === undefined || right === '';
    if (emptyLeft !== emptyRight) return emptyLeft ? 1 : -1;
    const compared = typeof left === 'number' && typeof right === 'number'
      ? left - right : collator.compare(String(left ?? ''), String(right ?? ''));
    return sort.direction === 'desc' ? -compared : compared;
  });
}

export function nextSort(sort, key) {
  return { key, direction: sort.key === key && sort.direction === 'asc' ? 'desc' : 'asc' };
}

export function SortHeader({ column, sort, onChange }) {
  const active = sort.key === column.key;
  return <th scope="col" aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
    <button type="button" className="receiving-sort-heading" onClick={() => onChange(nextSort(sort, column.key))}
      aria-label={'Sort by ' + column.label + (active && sort.direction === 'asc' ? ' descending' : ' ascending')}>
      {column.label}<span aria-hidden="true">{active ? (sort.direction === 'asc' ? '↑' : '↓') : '↕'}</span>
    </button>
  </th>;
}

export function SortControls({ columns, sort, onChange }) {
  return <div className="receiving-sort-controls">
    <label>Sort by<select value={sort.key} onChange={e => onChange({ ...sort, key: e.target.value })}>
      {columns.map(column => <option key={column.key} value={column.key}>{column.label}</option>)}
    </select></label>
    <label>Sort direction<select value={sort.direction} onChange={e => onChange({ ...sort, direction: e.target.value })}>
      <option value="asc">Ascending</option><option value="desc">Descending</option>
    </select></label>
  </div>;
}
