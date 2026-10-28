import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import AppFrame from './AppFrame';
import ReceivingLayout from '../ReturnReceiving/ReceivingLayout';

const mockLocation = { pathname: '/return' };
jest.mock('react-router-dom', () => ({
  useLocation: () => mockLocation,
  Link: ({ to, children, ...props }) => <a href={to} {...props}>{children}</a>,
  NavLink: ({ to, children, end, ...props }) => <a href={to} {...props}>{children}</a>,
}));

beforeEach(() => {
  mockLocation.pathname = '/return';
  localStorage.setItem('auth', JSON.stringify({ role: 'admin' }));
});

test('one visible tab list keeps its names, with app areas behind a dismissible switcher', () => {
  render(<AppFrame authenticated role="admin"><ReceivingLayout title="Returns" /></AppFrame>);
  expect(screen.getAllByRole('navigation')).toHaveLength(1);
  const receiving = screen.getByRole('navigation', { name: 'Receiving navigation' });
  expect(within(receiving).getByRole('link', { name: 'Returns' })).toHaveAttribute('href', '/return');
  expect(within(receiving).getByRole('link', { name: 'Previous records' })).toHaveAttribute('href', '/return/legacy');
  const trigger = screen.getByRole('button', { name: 'Switch area, current area: 3PL' });
  fireEvent.click(trigger);
  const navigation = screen.getByRole('navigation', { name: 'Main navigation' });
  expect(within(navigation).getByRole('link', { name: 'PC inventory' })).toHaveAttribute('href', '/pc');
  expect(within(navigation).getByRole('link', { name: 'Admin' })).toHaveAttribute('href', '/admin');
  within(navigation).getByRole('link', { name: 'Dashboard' }).focus();
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(trigger).toHaveFocus();
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(trigger);
  fireEvent.pointerDown(screen.getByRole('heading', { name: 'Returns' }));
  expect(screen.queryByRole('navigation', { name: 'Main navigation' })).not.toBeInTheDocument();
});

test('area links follow permissions and the switcher closes when the route changes', () => {
  localStorage.setItem('auth', JSON.stringify({ role: 'normal', permissions: ['return.view', 'pc.view', 'company.all'] }));
  const { rerender } = render(<AppFrame authenticated role="normal">Content</AppFrame>);
  fireEvent.click(screen.getByRole('button', { name: /Switch area/ }));
  const nav = screen.getByRole('navigation');
  expect(within(nav).getAllByRole('link').map(link => link.textContent)).toEqual(['Dashboard', 'Third-party logistics (3PL)', 'PC inventory']);
  mockLocation.pathname = '/pc';
  rerender(<AppFrame authenticated role="normal">Content</AppFrame>);
  expect(screen.getByRole('button', { name: 'Switch area, current area: PC inventory' })).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
});

test('login and registration keep account navigation without an app switcher', () => {
  mockLocation.pathname = '/';
  localStorage.clear();
  render(<AppFrame authenticated={false}>Login form</AppFrame>);
  expect(screen.queryByRole('button', { name: /Switch area/ })).not.toBeInTheDocument();
  expect(screen.getByRole('navigation', { name: 'Account navigation' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Register' })).toHaveAttribute('href', '/register');
});
