import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { BackToListing, RecordLink, listOrigin, useListState } from './listNavigation';

let mockLocation;
jest.mock('react-router-dom', () => ({
  useLocation: () => mockLocation,
  Link: ({ to, state, children, ...props }) => <a href={to} data-origin={state?.returnTo} {...props}>{children}</a>,
}));
beforeEach(() => {
  sessionStorage.clear();
  mockLocation = { pathname: '/return', search: '', state: null };
});

test('back links respect every original list and reject external destinations', () => {
  ['/return', '/return/manage', '/return/ship', '/return/legacy', '/pc', '/non-pc', '/xie', '/admin'].forEach(path => {
    mockLocation = { pathname: '/return/sid-1', search: '', state: { returnTo: path } };
    const view = render(<BackToListing fallback="/return" />);
    expect(screen.getByRole('link', { name: /Back to listing/ })).toHaveAttribute('href', path);
    view.unmount();
  });
  expect(listOrigin({ search: '?from=%2Fpc%3Fpage%3D2' }, '/return')).toBe('/pc?page=2');
  expect(listOrigin({ state: { returnTo: 'https://example.com' }, search: '?from=//example.com' }, '/pc')).toBe('/pc');
  expect(listOrigin({ search: '' }, '/non-pc')).toBe('/non-pc');
});

test('record and sibling links carry the ship origin through navigation', () => {
  mockLocation = { pathname: '/return/ship', search: '?pallet=3', state: null };
  const view = render(<RecordLink to="/return/sid-1">Unit</RecordLink>);
  expect(screen.getByText('Unit')).toHaveAttribute('data-origin', '/return/ship?pallet=3');
  mockLocation = { pathname: '/return/sid-1', search: '', state: { returnTo: '/return/ship?pallet=3' } };
  view.rerender(<RecordLink to="/return/sid-2">Sibling</RecordLink>);
  expect(screen.getByText('Sibling')).toHaveAttribute('data-origin', '/return/ship?pallet=3');
  view.rerender(<BackToListing fallback="/return" />);
  expect(screen.getByRole('link')).toHaveAttribute('href', '/return/ship?pallet=3');
});

function Listing() {
  const [filter, setFilter] = useListState('filter', '');
  return <input aria-label="Filter" value={filter} onChange={event => setFilter(event.target.value)} />;
}
test('list filters survive unmounting and remain separate for each list', () => {
  const first = render(<Listing />);
  fireEvent.change(screen.getByLabelText('Filter'), { target: { value: 'PALLET-3' } });
  first.unmount();
  const second = render(<Listing />);
  expect(screen.getByLabelText('Filter')).toHaveValue('PALLET-3');
  second.unmount();
  mockLocation = { pathname: '/return/manage', search: '' };
  render(<Listing />);
  expect(screen.getByLabelText('Filter')).toHaveValue('');
});
