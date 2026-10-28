import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import GenericForm from './GenericForm';
import GenericList from './GenericList';
import GroupedGenericList from './GroupedGenericList';
import MultiSelect from './MultiSelect';
import LaptopEdit from '../laptop/LaptopEdit';
import XieInput from '../Xie/XieInput';
import { requireOk } from './requestResult';
import { apiFetch } from './access';

const mockNavigate = jest.fn();
const mockLocation = { pathname: '/pc', search: '' };
jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => mockLocation,
  useParams: () => ({ id: '123' }),
  Link: ({ to, children, ...props }) => <a href={to} {...props}>{children}</a>,
}));
jest.mock('./access', () => ({ canPermission: () => true, authState: () => ({ username: 'tester' }), apiFetch: jest.fn(), API_SERVER: 'http://localhost:8088' }));

beforeEach(() => { jest.clearAllMocks(); localStorage.clear(); sessionStorage.clear(); });
const fields = [{ name: 'name', label: 'Name', type: 'text', required: true }];

test('saving waits for confirmation, prevents duplicate submission and preserves edits after failure', async () => {
  let rejectSave;
  const save = jest.fn(() => new Promise((resolve, reject) => { rejectSave = reject; }));
  render(<GenericForm initialData={{ name: '' }} fields={fields} onSubmit={save} basePath="/pc" />);
  fireEvent.change(screen.getByLabelText('Name *'), { target: { value: 'Updated record' } });
  fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
  expect(screen.getByRole('button', { name: 'Submitting...' })).toBeDisabled();
  expect(mockNavigate).not.toHaveBeenCalled();
  await act(async () => rejectSave(new Error('Unable to save changes.')));
  expect(screen.getByRole('alert')).toHaveTextContent('Unable to save changes.');
  expect(screen.getByLabelText('Name *')).toHaveValue('Updated record');
  expect(mockNavigate).not.toHaveBeenCalled();
  save.mockResolvedValueOnce({ success: true });
  fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
  await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/pc'));
});

test('whitespace-only required fields are rejected and focused', () => {
  const save = jest.fn();
  render(<GenericForm initialData={{ name: '   ' }} fields={fields} onSubmit={save} basePath="/pc" />);
  fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
  expect(save).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Name *')).toHaveFocus();
  expect(screen.getByLabelText('Name *')).toHaveAttribute('aria-invalid', 'true');
});

test('missing success confirmation does not discard a form', async () => {
  render(<GenericForm initialData={{ name: 'Keep me' }} fields={fields} onSubmit={async () => undefined} basePath="/pc" />);
  fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Changes were not saved');
  expect(mockNavigate).not.toHaveBeenCalled();
});

test('editing a sold PC preserves sold status and submits its updated specification', async () => {
  localStorage.setItem('auth', JSON.stringify({ username: 'tester' }));
  apiFetch.mockImplementation(url => Promise.resolve({ ok: true, json: async () => url.includes('/images/') ? [] : {
    Brand: 'HP', Model: 'Elite', Spec: '8GB+256GB', UpDatedSpec: '16GB+512GB', SerialNumber: 'SERIAL-123', Condition: 'A', Stock: 'SOLD', OrderNumber: 'ORDER-123',
  } }));
  render(<LaptopEdit handleLogout={jest.fn()} />);
  expect(await screen.findByLabelText('Stock (SOLD)')).toBeChecked();
  fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
  await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/pc/123'));
  const [, options] = apiFetch.mock.calls.find(([url]) => url.includes('/item/update/'));
  expect(options.body.get('stock')).toBe('SOLD');
  expect(options.body.get('updated_spec')).toBe('16GB+512GB');
});

test('filters work with native keyboard controls and Escape returns focus', () => {
  const change = jest.fn();
  render(<MultiSelect name="grade" label="Grade" options={[{ value: 'A', label: 'Grade A' }]} value={[]} onChange={change} />);
  const trigger = screen.getByRole('button', { name: 'Grade' });
  fireEvent.click(trigger);
  fireEvent.click(screen.getByRole('checkbox', { name: 'Grade A' }));
  expect(change).toHaveBeenCalledWith({ target: { name: 'grade', value: ['A'] } });
  fireEvent.keyDown(screen.getByRole('checkbox'), { key: 'Escape' });
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
  expect(trigger).toHaveFocus();
});

test('large lists paginate and hidden selections cannot be submitted after changing filters', () => {
  const items = Array.from({ length: 55 }, (_, index) => ({ ID: index + 1, Name: `Unit ${index + 1}` }));
  render(<GenericList items={items} columns={[{ key: 'Name', label: 'Name' }]} searchFields={[{ name: 'name', key: 'Name', label: 'Search name', type: 'text' }]} filterFields={[]} basePath="/non-pc" itemKey="ID" onSearch={jest.fn()} actions={[{ name: 'Ready To Sale', action: jest.fn() }]} />);
  expect(screen.getAllByRole('row')).toHaveLength(51);
  fireEvent.click(screen.getByLabelText('Select item 1'));
  expect(screen.getByRole('button', { name: /Actions \(1 selected\)/ })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Search name'), { target: { value: 'Unit 55' } });
  expect(screen.queryByRole('button', { name: /Actions/ })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'View item 55' })).toHaveAttribute('href', expect.stringContaining('/non-pc/55'));
});

test('grouping handles tracking numbers that match object prototype names', () => {
  render(<GroupedGenericList items={[{ id: 1, tracking_number: '__proto__' }]} columns={[{ key: 'tracking_number', label: 'Tracking' }]} searchFields={[]} filterFields={[]} basePath="/xie-list" itemKey="id" onSearch={jest.fn()} />);
  expect(screen.getByRole('link', { name: 'View tracking __proto__' })).toBeInTheDocument();
});

test('server errors do not expose internal traces, and permission failures are understandable', async () => {
  await expect(requireOk({ ok: false, status: 500, json: async () => ({ error: 'SQL connection secret trace' }) })).rejects.toThrow('Unable to complete the request');
  await expect(requireOk({ ok: false, status: 403, json: async () => ({}) })).rejects.toThrow('You do not have permission');
});

test('changing quantity preserves entered item details and label printing treats IDs as plain text', async () => {
  apiFetch.mockResolvedValue({ ok: true, json: async () => ({ max_id: 4 }) });
  render(<XieInput handleLogout={jest.fn()} />);
  await waitFor(() => expect(screen.getByLabelText('Return ID for item 1')).toHaveValue('No.00005'));
  fireEvent.change(screen.getByLabelText('Laptop Name for item 1'), { target: { value: 'Keep this unit' } });
  fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '2' } });
  expect(screen.getByLabelText('Laptop Name for item 1')).toHaveValue('Keep this unit');
  expect(screen.getByLabelText('Return ID for item 2')).toHaveValue('No.00006');
  const malicious = '<img src=x onerror=alert(1)>';
  fireEvent.change(screen.getByLabelText('Return ID for item 1'), { target: { value: malicious } });
  const printDocument = document.implementation.createHTMLDocument('Labels');
  const popup = { document: printDocument, focus: jest.fn(), print: jest.fn(), opener: window };
  const open = jest.spyOn(window, 'open').mockReturnValue(popup);
  fireEvent.click(screen.getByRole('button', { name: 'Print Return ID' }));
  expect(printDocument.querySelector('img')).toBeNull();
  expect(printDocument.querySelector('.label').textContent).toBe(malicious);
  expect(popup.opener).toBeNull();
  expect(popup.print).toHaveBeenCalled();
  open.mockRestore();
});
