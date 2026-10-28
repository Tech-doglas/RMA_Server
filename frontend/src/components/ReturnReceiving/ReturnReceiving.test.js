import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import ReturnReceivingInput from './ReturnReceivingInput';
import ReturnReceivingDetails from './ReturnReceivingDetails';
import ReturnReceivingShip from './ReturnReceivingShip';
import ReturnReceivingList from './ReturnReceivingList';
import LegacyReceivingList from './LegacyReceivingList';
import ReturnReceivingSettings from './ReturnReceivingSettings';
import ReturnReceivingAdminEdit from './ReturnReceivingAdminEdit';
import ReturnReceivingAdminConsole, { ReturnReceivingManage } from './ReturnReceivingAdminConsole';
import CompanySettings from './CompanySettings';
import PalletField from './PalletField';
import DepartmentSettings from './DepartmentSettings';
import Register from '../auth/Register';
import { receivingApi, postJson } from './receivingApi';
const mockNavigate = jest.fn();
const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

function fillRequiredReceivingFields() {
  fireEvent.change(screen.getByLabelText('Tracking #'), { target: { value: 'TEST-TRACK' } });
  screen.getAllByLabelText('UPC/Item code').forEach((field, index) => {
    fireEvent.change(field, { target: { value: 'CODE-' + (index + 1) } });
  });
}

jest.mock('react-router-dom', () => ({
  Link: ({ to, children, state, ...rest }) => <a href={to} {...rest}>{children}</a>,
  NavLink: ({ to, children }) => <a href={to}>{children}</a>,
  useParams: () => ({ id: 'sid-0001' }),
  useNavigate: () => mockNavigate,
  useLocation: () => ({ pathname: '/return', search: '', state: null }),
}));
jest.mock('./receivingApi', () => ({
  receivingApi: jest.fn(), postJson: jest.fn(), SERVER: 'http://localhost:8088',
  receivingAuth: () => ({ role: 'normal' }),
  today: () => '2026-09-30',
  statusOf: item => item.shipDate ? 'Shipped' : item.inspectionDate ? 'Inspected' : 'Awaiting inspection',
}));
jest.mock('./imageUpload', () => ({ optimizeImageForUpload: async file => file }));
jest.mock('../common/access', () => ({
  ...jest.requireActual('../common/access'), canPermission: jest.fn(() => true), authApi: jest.fn(),
}));

beforeEach(() => { sessionStorage.clear(); jest.resetAllMocks(); require('../common/access').canPermission.mockReturnValue(true); require('../common/access').authApi.mockResolvedValue({ departments: ['IT', 'Tech', 'Warehouse', 'Sale'] }); });
beforeEach(() => {
  URL.createObjectURL = jest.fn(file => 'blob:preview-' + file.name);
  URL.revokeObjectURL = jest.fn();
});
afterAll(() => {
  URL.createObjectURL = originalCreateObjectURL;
  URL.revokeObjectURL = originalRevokeObjectURL;
});
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});

test('bulk classification has only two choices and saves for existing units', async () => {
  receivingApi.mockResolvedValue({ item: { id: 1, fileNo: 'sid-0001', bulkType: 'REGULAR', tracking: 'OLD-TRACK', images: [], unitImages: [], siblings: [] } });
  postJson.mockResolvedValue({ updatedCount: 2 });
  render(<ReturnReceivingDetails />);
  const select = await screen.findByRole('combobox', { name: 'Bulk type' });
  expect(within(select).getAllByRole('option').map(option => option.value)).toEqual(['REGULAR', 'BULK_NEW']);
  expect(select).toHaveValue('REGULAR');
  fireEvent.change(select, { target: { value: 'BULK_NEW' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save bulk type' }));
  await screen.findByText('Bulk type saved for 2 unit(s).');
  expect(postJson).toHaveBeenCalledWith('/units/sid-0001/bulk-type', { bulkType: 'BULK_NEW' });
});

test('staff can assign an admin-created bulk option', async () => {
  require('../common/access').canPermission.mockImplementation(action => !['return.edit', 'return.delete'].includes(action));
  receivingApi.mockResolvedValue({ item: { id: 1, fileNo: 'sid-0001', bulkType: 'REPAIR', images: [], unitImages: [], siblings: [] }, bulkTypes: ['REGULAR', 'BULK_NEW', 'REPAIR'] });
  render(<ReturnReceivingDetails />);
  expect(await screen.findByRole('combobox', { name: 'Bulk type' })).toHaveValue('REPAIR');
  expect(screen.queryByRole('button', { name: 'Add type' })).not.toBeInTheDocument();
  expect(screen.queryByText('Edit or remove record')).not.toBeInTheDocument();
});

test('combined 3PL settings keep companies available while types are added, renamed, and removed', async () => {
  const typeResponses = [
    { bulkTypes: ['REGULAR', 'BULK_NEW'] },
    { bulkTypes: ['REGULAR', 'BULK_NEW', 'REPAIR'], message: 'Bulk types updated.' },
    { bulkTypes: ['REGULAR', 'BULK_NEW', 'REFURBISHED'], message: 'Bulk types updated.' },
    { bulkTypes: ['REGULAR', 'BULK_NEW'], message: 'Bulk types updated.' },
  ];
  receivingApi.mockImplementation(path => Promise.resolve(path === '/admin/companies' ? { companies: ['Demo company'] } : typeResponses.shift()));
  render(<ReturnReceivingSettings />);
  await screen.findByLabelText('Rename BULK_NEW');
  expect(await screen.findByLabelText('Rename Demo company')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Types & companies' })).toHaveAttribute('href', '/return/settings');
  expect(screen.queryByLabelText('Current password')).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('New type'), { target: { value: 'REPAIR' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add type' }));
  const rename = await screen.findByLabelText('Rename REPAIR');
  fireEvent.change(rename, { target: { value: 'REFURBISHED' } });
  fireEvent.submit(rename.closest('form'));
  await screen.findByLabelText('Rename REFURBISHED');
  const row = screen.getByLabelText('Rename REFURBISHED').closest('.receiving-unit');
  fireEvent.click(within(row).getByRole('button', { name: 'Remove type' }));
  expect(receivingApi).toHaveBeenCalledTimes(4);
  fireEvent.click(within(row).getByRole('button', { name: 'Confirm remove type' }));
  await waitFor(() => expect(screen.queryByLabelText('Rename REFURBISHED')).not.toBeInTheDocument());
  expect(receivingApi).toHaveBeenLastCalledWith('/admin/types', expect.objectContaining({ method: 'DELETE', body: JSON.stringify({ name: 'REFURBISHED', replacement: 'REGULAR' }) }));
  expect(screen.getByLabelText('Rename Demo company')).toBeInTheDocument();
});

test('admin record removal requires matching File Number and editing preserves it', async () => {
  receivingApi.mockResolvedValueOnce({ item: { id: 1, fileNo: 'sid-0001', laptop: 'Dell', tracking: 'TRACK', company: 'Acme', upc: '00123', receivedDate: '2026-09-30', bulkType: 'REGULAR' }, bulkTypes: ['REGULAR', 'BULK_NEW'] })
    .mockResolvedValueOnce({ message: 'Return record updated.' }).mockResolvedValueOnce({ message: 'Return record removed.' });
  render(<ReturnReceivingAdminEdit />);
  fireEvent.change(await screen.findByLabelText('Item code/name'), { target: { value: 'Updated Dell' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save record' }));
  await screen.findByText('Return record updated.');
  expect(receivingApi).toHaveBeenLastCalledWith('/admin/units/sid-0001', expect.objectContaining({ method: 'PATCH', body: expect.stringContaining('Updated Dell') }));
  const remove = screen.getByRole('button', { name: 'Remove record' });
  expect(remove).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Enter sid-0001 to confirm'), { target: { value: 'wrong' } });
  expect(remove).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Enter sid-0001 to confirm'), { target: { value: 'sid-0001' } });
  fireEvent.click(remove);
  await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/return/manage'));
  expect(receivingApi).toHaveBeenLastCalledWith('/admin/units/sid-0001', expect.objectContaining({ method: 'DELETE', body: JSON.stringify({ confirmFileNo: 'sid-0001' }) }));
});

test('admin can rename departments and save detailed action permissions', async () => {
  const catalog = [{ key: 'return.view', label: 'View returns', group: '3PL' }, { key: 'return.ship', label: 'Ship units', group: '3PL' }];
  receivingApi.mockResolvedValueOnce({ departments: [{ name: 'Warehouse', permissions: ['return.view'] }], catalog })
    .mockResolvedValueOnce({ departments: [{ name: 'Receiving', permissions: ['return.view', 'return.ship'] }], catalog, message: 'Permissions saved.' });
  render(<DepartmentSettings />);
  await screen.findByRole('option', { name: 'Warehouse' });
  fireEvent.change(screen.getByLabelText('Department to manage'), { target: { value: 'Warehouse' } });
  expect(screen.getByLabelText('View returns')).toBeChecked();
  expect(screen.getByLabelText('Ship units')).not.toBeChecked();
  fireEvent.click(screen.getByLabelText('Ship units'));
  fireEvent.change(screen.getByLabelText('Department name'), { target: { value: 'Receiving' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save department permissions' }));
  await screen.findByText('Permissions saved.');
  expect(JSON.parse(receivingApi.mock.calls[1][1].body)).toEqual({ name: 'Warehouse', newName: 'Receiving', permissions: ['return.view', 'return.ship'] });
  expect(screen.getByLabelText('Department to manage')).toHaveValue('Receiving');
});

test('record editor saves complete receiving fields and reduces quantity only for explicitly selected units', async () => {
  const item = { id: 1, fileNo: 'sid-0001', tracking: 'TRACK', company: 'Acme', upc: 'A', itemName: 'Old saved name',
    receivedDate: '2026-09-30', bulkType: 'REGULAR', unitIndex: 1, quantityKnown: 1, groupSize: 2,
    images: [], unitImages: [], siblings: [{ id: 2, fileNo: 'sid-0002', upc: 'B', unitIndex: 2 }] };
  const data = { item, bulkTypes: ['REGULAR'], companies: ['Acme'] };
  receivingApi.mockResolvedValueOnce(data).mockResolvedValueOnce({ message: 'Record saved.' })
    .mockResolvedValueOnce({ message: 'Quantity updated.' }).mockResolvedValueOnce({ ...data, item: { ...item, siblings: [], groupSize: 1 } });
  render(<ReturnReceivingAdminEdit />);
  const code = await screen.findByLabelText('UPC/Item code');
  expect(screen.queryByLabelText('Item name')).not.toBeInTheDocument();
  expect(screen.getByLabelText('File Number')).toHaveAttribute('readonly');
  fireEvent.change(code, { target: { value: '001234' } });
  fireEvent.change(screen.getByLabelText('Order number'), { target: { value: 'ORDER-1' } });
  fireEvent.change(screen.getByLabelText('Code'), { target: { value: 'PC' } });
  fireEvent.change(screen.getByLabelText('Recorded status'), { target: { value: 'yes' } });
  expect(screen.getByLabelText('Delivery quantity')).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Save record' }));
  await screen.findByText('Record saved.');
  const saved = JSON.parse(receivingApi.mock.calls[1][1].body);
  expect(saved).toMatchObject({ upc: '001234', OrderNumber: 'ORDER-1', Code: 'PC', Recorded: true });
  expect(saved).not.toHaveProperty('itemName');
  expect(saved).not.toHaveProperty('id');
  fireEvent.change(screen.getByLabelText('Delivery quantity'), { target: { value: '1' } });
  const saveQuantity = screen.getByRole('button', { name: 'Save delivery quantity' });
  expect(saveQuantity).toBeDisabled();
  expect(screen.getByRole('checkbox', { name: /sid-0001/ })).toBeDisabled();
  fireEvent.click(screen.getByRole('checkbox', { name: /sid-0002/ }));
  fireEvent.click(saveQuantity);
  await screen.findByText('Quantity updated.');
  expect(receivingApi).toHaveBeenCalledWith('/admin/units/sid-0001/quantity', expect.objectContaining({
    body: JSON.stringify({ quantity: 1, expectedIds: [1, 2], removeIds: [2] }),
  }));
});

test('record editor previews saved photos and explicitly replaces only selected unit photos', async () => {
  const item = { id: 1, fileNo: 'sid-0001', tracking: 'TRACK', company: 'Acme', upc: 'A', receivedDate: '2026-09-30',
    bulkType: 'REGULAR', images: ['/label.png'], unitImages: ['/unit.png'], siblings: [] };
  receivingApi.mockResolvedValueOnce({ item, bulkTypes: ['REGULAR'] })
    .mockResolvedValueOnce({ photos: ['/replacement.png'], message: 'Photos updated.' });
  render(<ReturnReceivingAdminEdit />);
  fireEvent.click(await screen.findByRole('button', { name: 'Preview Unit photos 1' }));
  expect(within(screen.getByRole('dialog')).getByAltText('Full preview: Unit photos 1')).toHaveAttribute('src', 'http://localhost:8088/unit.png');
  fireEvent.click(screen.getByRole('button', { name: 'Close preview' }));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Keep unit photos 1' }));
  fireEvent.change(screen.getByLabelText('Add unit photos'), { target: { files: [new File(['image'], 'new.png', { type: 'image/png' })] } });
  fireEvent.click(screen.getByRole('button', { name: 'Save unit photos' }));
  await screen.findByText('Photos updated.');
  const [path, options] = receivingApi.mock.calls[1];
  expect(path).toBe('/admin/units/sid-0001/photos');
  expect(options.body.get('field')).toBe('unitImages');
  expect(JSON.parse(options.body.get('expected'))).toEqual(['/unit.png']);
  expect(JSON.parse(options.body.get('keep'))).toEqual([]);
  expect(options.body.getAll('images')).toHaveLength(1);
  expect(screen.getByAltText('Shipping label photos 1')).toHaveAttribute('src', 'http://localhost:8088/label.png');
});

test('previous records combine filters, include the end date, and clear them', async () => {
  receivingApi.mockResolvedValue([
    { id: 1, TrackingNumber: 'TRACK-2', Company: 'Acme', Code: 'RETURN', OrderNumber: 'ORDER-1', Recorded: false, CreationDateTime: 'Thu, 24 Sep 2026 23:59:00 GMT' },
    { id: 2, TrackingNumber: 'TRACK-10', Company: 'Acme', Code: 'RETURN', Recorded: true, CreationDateTime: '2026-09-24T00:00:00' },
    { id: 3, TrackingNumber: 'TRACK-3', Company: 'Other', Code: 'REPAIR', Recorded: null, CreationDateTime: '2026-09-25T00:00:00' },
  ]);
  render(<LegacyReceivingList />);
  await screen.findByRole('link', { name: 'TRACK-2' });
  fireEvent.change(screen.getByLabelText('Company'), { target: { value: 'Acme' } });
  fireEvent.change(screen.getByLabelText('Code'), { target: { value: 'RETURN' } });
  fireEvent.change(screen.getByLabelText('Recorded status'), { target: { value: 'no' } });
  fireEvent.change(screen.getByLabelText('Received from'), { target: { value: '2026-09-24' } });
  fireEvent.change(screen.getByLabelText('Received to'), { target: { value: '2026-09-24' } });
  expect(screen.getByRole('status')).toHaveTextContent('1 of 3 records');
  expect(screen.getByRole('link', { name: 'TRACK-2' })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'TRACK-10' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
  expect(screen.getByRole('status')).toHaveTextContent('3 of 3 records');
});

test('previous records sort all results numerically before pagination and retain browsing state', async () => {
  receivingApi.mockResolvedValue(Array.from({ length: 55 }, (_, i) => ({ id: i + 1, TrackingNumber: 'TRACK-' + (i + 1), Company: 'Acme', CreationDateTime: '2026-09-24', Recorded: false })));
  const view = render(<LegacyReceivingList />);
  await screen.findByRole('link', { name: 'TRACK-1' });
  fireEvent.click(screen.getByRole('button', { name: 'Sort by Tracking # ascending' }));
  const table = () => screen.getByRole('table', { name: 'Previous receiving records' });
  expect(within(table()).getAllByRole('link').slice(0, 3).map(link => link.textContent)).toEqual(['TRACK-1', 'TRACK-2', 'TRACK-3']);
  fireEvent.click(screen.getByRole('button', { name: 'Sort by Tracking # descending' }));
  expect(within(table()).getAllByRole('link')[0]).toHaveTextContent('TRACK-55');
  expect(screen.getByRole('button', { name: 'Sort by Tracking # ascending' }).closest('th')).toHaveAttribute('aria-sort', 'descending');
  fireEvent.click(screen.getByRole('button', { name: 'Next', exact: true }));
  expect(within(table()).getAllByRole('link')).toHaveLength(5);
  view.unmount();
  render(<LegacyReceivingList />);
  await screen.findByRole('link', { name: 'TRACK-5' });
  expect(screen.getByLabelText('Sort direction')).toHaveValue('desc');
  expect(within(table()).getAllByRole('link')).toHaveLength(5);
  fireEvent.change(screen.getByLabelText('Search previous records'), { target: { value: 'TRACK-55' } });
  expect(screen.getByText(/Page 1 of 1/)).toBeInTheDocument();
  expect(within(table()).getAllByRole('link')).toHaveLength(1);
});

test('return filters combine type, pallet and dates while sorting preserves tracking groups', async () => {
  receivingApi.mockResolvedValue({ companies: ['Acme'], items: [
    { id: 10, fileNo: 'sid-0010', tracking: 'A', laptop: 'Laptop 10', company: 'Acme', bulkType: 'REGULAR', pallet: 'P-1', receivedDate: '2026-09-24', unitIndex: 2, groupSize: 2 },
    { id: 3, fileNo: 'sid-0003', tracking: 'B', laptop: 'Laptop 3', company: 'Acme', bulkType: 'BULK_NEW', pallet: 'P-2', receivedDate: '2026-09-25', unitIndex: 1, groupSize: 1 },
    { id: 2, fileNo: 'sid-0002', tracking: 'A', laptop: 'Laptop 2', company: 'Acme', bulkType: 'REGULAR', pallet: 'P-1', receivedDate: '2026-09-23', unitIndex: 1, groupSize: 2 },
  ] });
  render(<ReturnReceivingList />);
  await screen.findByRole('link', { name: 'sid-0010' });
  fireEvent.click(screen.getByRole('button', { name: 'Sort by File no. ascending' }));
  const table = screen.getByRole('table', { name: 'Returns' });
  expect(within(table).getAllByRole('link').map(link => link.textContent)).toEqual(['sid-0002', 'sid-0010', 'sid-0003']);
  fireEvent.change(screen.getByLabelText('Bulk type filter'), { target: { value: 'REGULAR' } });
  fireEvent.change(screen.getByLabelText('Pallet filter'), { target: { value: 'p-1' } });
  fireEvent.change(screen.getByLabelText('Received from'), { target: { value: '2026-09-24' } });
  fireEvent.change(screen.getByLabelText('Received to'), { target: { value: '2026-09-24' } });
  expect(within(table).getAllByRole('link').map(link => link.textContent)).toEqual(['sid-0010']);
  expect(screen.getByText(/Showing 1/)).toHaveTextContent('Quantity: 2');
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
  fireEvent.change(screen.getByLabelText('Sort by'), { target: { value: 'tracking' } });
  fireEvent.change(screen.getByLabelText('Sort direction'), { target: { value: 'desc' } });
  expect(within(table).getAllByRole('link')[0]).toHaveTextContent('sid-0003');
});

test('return search matches full and partial UPCs and combines with company filters', async () => {
  receivingApi.mockResolvedValue({ companies: ['Acme', 'Other'], items: [
    { id: 1, fileNo: 'sid-0001', tracking: 'A', upc: '001234567890', company: 'Acme' },
    { id: 2, fileNo: 'sid-0002', tracking: 'B', upc: '001234567890', company: 'Other' },
    { id: 3, fileNo: 'sid-0003', tracking: 'C', company: 'Acme' },
  ] });
  render(<ReturnReceivingList />);
  await screen.findByRole('link', { name: 'sid-0003' });
  const table = screen.getByRole('table', { name: 'Returns' });
  for (const query of [' 001234567890 ', '001234']) {
    fireEvent.change(screen.getByLabelText('Search returns'), { target: { value: query } });
    expect(within(table).getAllByRole('link').map(link => link.textContent)).toEqual(['sid-0002', 'sid-0001']);
  }
  fireEvent.change(screen.getByLabelText('Company'), { target: { value: 'Acme' } });
  expect(within(table).getAllByRole('link').map(link => link.textContent)).toEqual(['sid-0001']);
  fireEvent.change(screen.getByLabelText('Search returns'), { target: { value: '009999999999' } });
  expect(within(table).queryByRole('link')).not.toBeInTheDocument();
});

test('returns exclude historical receipts and their confirmed units without using a date cutoff', async () => {
  sessionStorage.setItem('list-view:/return:filters', JSON.stringify({ status: 'Quantity to confirm' }));
  receivingApi.mockResolvedValue({ companies: ['Acme'], items: [
    { id: 1, fileNo: 'sid-0001', tracking: 'SHARED', legacyId: 100, groupId: 'legacy_100', quantityKnown: 0, receivedDate: '2026-10-06', company: 'Acme' },
    { id: 2, fileNo: 'sid-0002', tracking: 'SHARED', legacyId: 101, groupId: 'legacy_101', quantityKnown: 1, receivedDate: '2026-10-06', company: 'Acme' },
    { id: 3, fileNo: 'sid-0003', tracking: 'SHARED', legacyId: null, groupId: 'legacy_101', quantityKnown: 1, receivedDate: '2026-10-06', company: 'Acme' },
    { id: 4, fileNo: 'sid-0004', tracking: 'SHARED', legacyId: null, groupId: 'g_new', quantityKnown: 1, receivedDate: '2020-01-01', company: 'Acme', unitIndex: 1, groupSize: 1 },
  ] });
  render(<ReturnReceivingList />);
  await screen.findByRole('link', { name: 'sid-0004' });
  const table = screen.getByRole('table', { name: 'Returns' });
  expect(within(table).getAllByRole('link').map(link => link.textContent)).toEqual(['sid-0004']);
  expect(screen.getByText('New receiving records').closest('.receiving-stat')).toHaveTextContent('1');
  expect(screen.getByText(/Quantity: 1/)).not.toHaveTextContent('Showing');
  expect(screen.getByRole('status')).toHaveTextContent('1 records · 1 groups');
  expect(screen.getByRole('link', { name: 'Previous records' })).toHaveAttribute('href', '/return/legacy');
  expect(screen.getByRole('link', { name: 'Returns' })).toHaveAttribute('href', '/return');
  expect(screen.getByRole('heading', { name: 'Returns' })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Search returns'), { target: { value: 'sid-0001' } });
  expect(within(table).queryByRole('link')).not.toBeInTheDocument();
});

test('historical receiving keeps its fields and requires an explicit quantity', async () => {
  const item = { id: 1, fileNo: 'sid-0001', quantityKnown: 0, legacyId: 7, Code: 'PC', OrderNumber: 'OLD-ORDER', Recorded: 1, images: [], unitImages: [], siblings: [] };
  receivingApi.mockResolvedValueOnce({ item }).mockResolvedValue({ item: { ...item, quantityKnown: 1, groupSize: 2, unitIndex: 1 } });
  postJson.mockResolvedValue({ quantity: 2 });
  render(<ReturnReceivingDetails />);
  const quantity = await screen.findByLabelText('Confirmed quantity');
  expect(quantity).toHaveValue(null);
  expect(screen.getByText('OLD-ORDER')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Save inspection' })).toBeDisabled();
  fireEvent.change(quantity, { target: { value: '2' } });
  fireEvent.click(screen.getByRole('button', { name: 'Confirm quantity' }));
  await screen.findByText('Quantity confirmed. This delivery has 2 unit(s), each with its own File Number.');
  expect(postJson).toHaveBeenCalledWith('/units/sid-0001/quantity', { quantity: 2 });
  expect(screen.queryByLabelText('Confirmed quantity')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Save inspection' })).toBeEnabled();
});

test('view-only staff can read historical fields without confirming quantity', async () => {
  require('../common/access').canPermission.mockImplementation(action => action === 'return.view');
  receivingApi.mockResolvedValue({ item: { id: 1, fileNo: 'sid-0001', quantityKnown: 0, Code: 'PC', images: [], unitImages: [], siblings: [] } });
  render(<ReturnReceivingDetails />);
  await screen.findByText('A staff member with Receive deliveries permission can confirm this quantity.');
  expect(screen.queryByRole('button', { name: 'Confirm quantity' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Save inspection' })).toBeDisabled();
});

test('permission groups separate viewing from changes, deletion, and downloads without search changing grants', async () => {
  const catalog = [
    { key: 'return.view', label: 'View returns', group: '3PL' },
    { key: 'return.pallet_view', label: 'View pallets and shipment details', group: '3PL' },
    { key: 'return.ship', label: 'Ship units', group: '3PL' },
    { key: 'return.delete', label: 'Remove return records', group: '3PL' },
    { key: 'return.export', label: 'Export return records', group: '3PL' },
  ];
  receivingApi.mockResolvedValue({ departments: [{ name: 'Warehouse', permissions: ['return.view', 'return.pallet_view'] }], catalog });
  render(<DepartmentSettings />);
  await screen.findByRole('option', { name: 'Warehouse' });
  fireEvent.change(screen.getByLabelText('Department to manage'), { target: { value: 'Warehouse' } });
  expect(within(screen.getByRole('region', { name: '3PL — View only' })).getByRole('checkbox', { name: 'View pallets and shipment details' })).toBeChecked();
  expect(within(screen.getByRole('region', { name: '3PL — Create & update' })).getByRole('checkbox', { name: 'Ship units' })).not.toBeChecked();
  expect(within(screen.getByRole('region', { name: '3PL — Delete' })).getByRole('checkbox', { name: 'Remove return records' })).not.toBeChecked();
  expect(within(screen.getByRole('region', { name: '3PL — Download / print' })).getByRole('checkbox', { name: 'Export return records' })).not.toBeChecked();
  fireEvent.change(screen.getByLabelText('Find a permission'), { target: { value: 'Create & update' } });
  expect(screen.queryByRole('checkbox', { name: 'View returns' })).not.toBeInTheDocument();
  expect(screen.getByRole('checkbox', { name: 'Ship units' })).not.toBeChecked();
  fireEvent.change(screen.getByLabelText('Find a permission'), { target: { value: '' } });
  expect(screen.getByRole('checkbox', { name: 'View pallets and shipment details' })).toBeChecked();
  expect(screen.getByRole('button', { name: 'Save department permissions' })).toBeDisabled();
  expect(receivingApi).toHaveBeenCalledTimes(1);
});

test('required viewing access is visible and saved with an action, and draft changes can be discarded', async () => {
  const catalog = [{ key: 'return.view', label: 'View returns', group: '3PL' }, { key: 'return.ship', label: 'Ship units', group: '3PL' }, { key: 'return.pallet_view', label: 'View pallets and shipment details', group: '3PL' }];
  receivingApi.mockResolvedValueOnce({ departments: [{ name: 'Warehouse', permissions: [] }], catalog })
    .mockResolvedValueOnce({ departments: [{ name: 'Warehouse', permissions: ['return.view', 'return.ship'] }], catalog, message: 'Permissions saved.' });
  render(<DepartmentSettings />);
  await screen.findByRole('option', { name: 'Warehouse' });
  fireEvent.change(screen.getByLabelText('Department to manage'), { target: { value: 'Warehouse' } });
  fireEvent.click(screen.getByRole('checkbox', { name: 'Ship units' }));
  expect(screen.getByRole('checkbox', { name: 'View returns' })).toBeChecked();
  expect(screen.getByRole('checkbox', { name: 'View returns' })).toBeDisabled();
  expect(screen.getByText('Required by another enabled permission.')).toBeInTheDocument();
  expect(screen.getByText('Included through shipping or pallet management. Check to allow this view independently.')).toBeInTheDocument();
  expect(screen.getByRole('checkbox', { name: 'View pallets and shipment details' })).not.toBeChecked();
  expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
  expect(screen.getByRole('checkbox', { name: 'View returns' })).not.toBeChecked();
  expect(screen.getByRole('checkbox', { name: 'View returns' })).toBeEnabled();
  expect(screen.getByRole('checkbox', { name: 'Ship units' })).not.toBeChecked();
  expect(screen.queryByText('Included')).not.toBeInTheDocument();
  expect(receivingApi).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('checkbox', { name: 'Ship units' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save department permissions' }));
  await screen.findByText('Permissions saved.');
  expect(JSON.parse(receivingApi.mock.calls[1][1].body)).toEqual({ name: 'Warehouse', newName: 'Warehouse', permissions: ['return.ship', 'return.view'] });
  expect(screen.getByRole('button', { name: 'Save department permissions' })).toBeDisabled();
});

test('read-only departments cannot inspect, classify, upload photos, or edit returns', async () => {
  require('../common/access').canPermission.mockImplementation(action => action === 'return.view');
  receivingApi.mockResolvedValue({ item: { id: 1, fileNo: 'sid-0001', images: [], unitImages: [], siblings: [] } });
  render(<ReturnReceivingDetails />);
  await screen.findByLabelText('Serial number');
  expect(screen.getByRole('button', { name: 'Save inspection' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Save bulk type' })).toBeDisabled();
  expect(screen.queryByText('Edit or remove record')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Additional unit photos')).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Types & companies' })).not.toBeInTheDocument();
});

test('administration is separate from 3PL and links to record management', async () => {
  receivingApi.mockResolvedValue({ totals: { received: 4102 }, typeUsage: [] });
  render(<ReturnReceivingAdminConsole />);
  await screen.findByText('4102');
  expect(screen.queryByRole('navigation', { name: 'Receiving navigation' })).not.toBeInTheDocument();
  expect(screen.queryByRole('tab', { name: 'Returns' })).not.toBeInTheDocument();
  expect(screen.queryByRole('tab', { name: 'Bulk types' })).not.toBeInTheDocument();
  expect(screen.queryByRole('tab', { name: 'Companies' })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Manage 3PL records' })).toHaveAttribute('href', '/return/manage');
  expect(screen.getByRole('tab', { name: 'Accounts' })).toBeInTheDocument();
});

test('3PL management searches returns and applies bulk changes only to selected IDs', async () => {
  require('../common/access').canPermission.mockImplementation(action => !['return.restore', 'return.export'].includes(action));
  receivingApi.mockImplementation((path, options) => {
    if (path === '/admin/overview') return Promise.resolve({ totals: { received: 4102 }, typeUsage: [] });
    if (path === '/admin/types') return Promise.resolve({ bulkTypes: ['REGULAR', 'BULK_NEW'] });
    if (path === '/admin/bulk') return Promise.resolve({ message: '2 record(s) updated.' });
    return Promise.resolve({ items: [{ id: 1, fileNo: 'sid-0001', tracking: 'TRACK', bulkType: 'REGULAR', receivedDate: '2026-09-30' }], total: 1 });
  });
  render(<ReturnReceivingManage />);
  fireEvent.click(await screen.findByLabelText('Select sid-0001'));
  fireEvent.change(screen.getByLabelText('New bulk type'), { target: { value: 'BULK_NEW' } });
  fireEvent.click(screen.getByRole('button', { name: 'Apply to selected' }));
  await screen.findByText('2 record(s) updated.');
  expect(receivingApi).toHaveBeenCalledWith('/admin/bulk', expect.objectContaining({ body: JSON.stringify({ unitIds: [1], action: 'type', value: 'BULK_NEW', confirmation: '' }) }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Search returns' })).toBeEnabled());
  fireEvent.change(screen.getByLabelText('Search', { exact: true }), { target: { value: 'sid-0001' } });
  fireEvent.click(screen.getByRole('button', { name: 'Search returns' }));
  await waitFor(() => expect(receivingApi).toHaveBeenCalledWith(expect.stringContaining('q=sid-0001')));
});

test('admin account form edits roles and disables accounts without requiring a password reset', async () => {
  receivingApi.mockImplementation((path, options) => Promise.resolve(path === '/admin/overview' ? { totals: {}, typeUsage: [] } : { users: [{ username: 'staff-one', role: 'normal', department: 'Tech', isActive: 1 }], message: options ? 'Accounts updated.' : '' }));
  render(<ReturnReceivingAdminConsole />);
  fireEvent.click(screen.getByRole('tab', { name: 'Accounts' }));
  expect(screen.getByRole('heading', { name: 'Change your admin password' })).toBeInTheDocument();
  fireEvent.click(await screen.findByRole('button', { name: 'Change role staff-one' }));
  expect(screen.getByLabelText('Username')).toHaveAttribute('readonly');
  expect(screen.getByLabelText('Reset password (optional)')).not.toBeRequired();
  fireEvent.change(screen.getByLabelText('Account status'), { target: { value: 'disabled' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save account' }));
  await screen.findByText('Accounts updated.');
  expect(receivingApi).toHaveBeenCalledWith('/admin/users', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ username: 'staff-one', role: 'normal', department: 'Tech', isActive: false, password: '' }) }));
});

test('removed records can be restored from the admin history', async () => {
  let restored = false;
  receivingApi.mockImplementation(path => {
    if (path === '/admin/overview') return Promise.resolve({ totals: {}, typeUsage: [] });
    if (path.startsWith('/admin/history')) return Promise.resolve({ items: [], total: 0 });
    if (path === '/admin/restore/12') { restored = true; return Promise.resolve({ message: 'Record restored with its original ID and File Number.' }); }
    return Promise.resolve({ items: restored ? [] : [{ id: 12, username: 'admin', action: 'remove unit', timestamp: '2026-09-30', target: '1', snapshot: { fileNo: 'sid-0001' } }], total: restored ? 0 : 1 });
  });
  render(<ReturnReceivingAdminConsole />);
  fireEvent.click(screen.getByRole('tab', { name: 'History' }));
  fireEvent.click(screen.getByRole('button', { name: 'Removed records' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Restore sid-0001' }));
  await screen.findByText('Record restored with its original ID and File Number.');
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Restore sid-0001' })).not.toBeInTheDocument());
});

test('admin can disable and enable an account with explicit confirmation', async () => {
  let active = true;
  receivingApi.mockImplementation((path, options) => {
    if (path === '/admin/overview') return Promise.resolve({ totals: {}, typeUsage: [] });
    if (options?.method === 'PATCH') active = JSON.parse(options.body).isActive;
    return Promise.resolve({ users: [{ username: 'staff-two', role: 'normal', department: 'Tech', isActive: active, approvalStatus: 'approved' }] });
  });
  render(<ReturnReceivingAdminConsole />);
  fireEvent.click(screen.getByRole('tab', { name: 'Accounts' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Disable account staff-two' }));
  expect(receivingApi).not.toHaveBeenCalledWith('/admin/users', expect.objectContaining({ method: 'PATCH' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm disable staff-two' }));
  await screen.findByText('Account disabled. Login is blocked.');
  fireEvent.click(screen.getByRole('button', { name: 'Enable account staff-two' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm enable staff-two' }));
  await screen.findByText('Account enabled.');
  expect(receivingApi).toHaveBeenLastCalledWith('/admin/users', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ username: 'staff-two', role: 'normal', department: 'Tech', isActive: true, password: '' }) }));
});

test('the named admin account has locked role and status controls', async () => {
  receivingApi.mockImplementation(path => Promise.resolve(path === '/admin/overview' ? { totals: {}, typeUsage: [] } : { users: [{ username: 'admin', role: 'admin', department: 'IT', isActive: 1, approvalStatus: 'approved' }] }));
  render(<ReturnReceivingAdminConsole />);
  fireEvent.click(screen.getByRole('tab', { name: 'Accounts' }));
  expect(await screen.findByRole('button', { name: 'Disable account admin' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Edit admin account' }));
  expect(screen.getByLabelText('Role')).toBeDisabled();
  expect(screen.getByLabelText('Role')).toHaveValue('admin');
  expect(screen.getByLabelText('Account status')).toBeDisabled();
  expect(screen.getByLabelText('Account status')).toHaveValue('active');
});

test('admin can create a database backup and see its saved name', async () => {
  receivingApi.mockImplementation(path => Promise.resolve(path === '/admin/overview' ? { totals: {}, typeUsage: [] } : { message: 'Database backup saved.', filename: 'admin-backup.sqlite3' }));
  render(<ReturnReceivingAdminConsole />);
  fireEvent.click(screen.getByRole('tab', { name: 'Export & backup' }));
  fireEvent.click(screen.getByRole('button', { name: 'Create database backup' }));
  await screen.findByText('Database backup saved. File: admin-backup.sqlite3');
});

test('admin can filter pending registrations and approve an account', async () => {
  let approved = false;
  receivingApi.mockImplementation((path, options) => {
    if (path === '/admin/overview') return Promise.resolve({ totals: {}, typeUsage: [] });
    if (path === '/admin/users/approval') approved = true;
    return Promise.resolve({ users: [{ username: 'pending-one', role: 'normal', department: 'Tech', isActive: 1, approvalStatus: approved ? 'approved' : 'pending' }], message: approved ? 'Registration approved.' : '' });
  });
  render(<ReturnReceivingAdminConsole />);
  fireEvent.click(screen.getByRole('tab', { name: 'Accounts' }));
  await screen.findByRole('button', { name: 'Approve pending-one' });
  fireEvent.change(screen.getByLabelText('Registration filter'), { target: { value: 'pending' } });
  fireEvent.click(screen.getByRole('button', { name: 'Approve pending-one' }));
  await screen.findByText('Registration approved.');
  expect(screen.queryByRole('button', { name: 'Approve pending-one' })).not.toBeInTheDocument();
  expect(receivingApi).toHaveBeenCalledWith('/admin/users/approval', expect.objectContaining({ body: JSON.stringify({ username: 'pending-one', decision: 'approve' }) }));
});

test('registration shows the approval message instead of automatically going to login', async () => {
  const originalFetch = global.fetch;
  global.fetch = jest.fn().mockImplementation(url => Promise.resolve({ ok: true, json: async () => url.endsWith('/departments') ? { departments: ['Tech'] } : { message: 'Registration submitted. An admin must approve your account before you can log in.' } }));
  try {
    render(<Register />);
    await screen.findByRole('option', { name: 'Tech' });
    fireEvent.change(screen.getByPlaceholderText('Username'), { target: { value: 'new-staff' } });
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'new-password' } });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Tech' } });
    fireEvent.click(screen.getByRole('button', { name: 'Register', exact: true }));
    await screen.findByRole('status');
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Register', exact: true })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Back To Login' })).toBeEnabled();
    expect(JSON.parse(global.fetch.mock.calls.find(([url]) => url.endsWith('/register'))[1].body)).toEqual({ username: 'new-staff', password: 'new-password', department: 'Tech' });
  } finally { global.fetch = originalFetch; }
});

test('admin can add, rename and remove company options with a replacement', async () => {
  receivingApi.mockResolvedValueOnce({ companies: ['Others'] })
    .mockResolvedValueOnce({ companies: ['Others', 'Acme'], message: 'Company added.' })
    .mockResolvedValueOnce({ companies: ['Others', 'Acme Logistics'], message: 'Company renamed.' })
    .mockResolvedValueOnce({ companies: ['Others'], message: 'Company removed.' });
  render(<CompanySettings />);
  await screen.findByLabelText('Rename Others');
  fireEvent.change(screen.getByLabelText('New company'), { target: { value: 'Acme' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add company' }));
  const rename = await screen.findByLabelText('Rename Acme');
  fireEvent.change(rename, { target: { value: 'Acme Logistics' } });
  fireEvent.click(within(rename.closest('form')).getByRole('button', { name: 'Rename company' }));
  const renamed = await screen.findByLabelText('Rename Acme Logistics');
  fireEvent.click(within(renamed.closest('form')).getByRole('button', { name: 'Remove company' }));
  fireEvent.change(screen.getByLabelText('Replacement for Acme Logistics'), { target: { value: 'Others' } });
  fireEvent.click(screen.getByRole('button', { name: 'Confirm remove company' }));
  await screen.findByText('Company removed.');
  expect(JSON.parse(receivingApi.mock.calls[3][1].body)).toEqual({ name: 'Acme Logistics', replacement: 'Others' });
});

test('unit photo selections accumulate and are uploaded separately for each unit', async () => {
  receivingApi.mockResolvedValueOnce({ companies: ['Others'] }).mockResolvedValueOnce({ quantity: 2, fileNos: ['sid-0001', 'sid-0002'] });
  render(<ReturnReceivingInput />);
  await waitFor(() => expect(screen.getByLabelText('Company')).toBeEnabled());
  fireEvent.click(screen.getByText('+ Add item'));
  const photos = screen.getAllByLabelText('Unit photos');
  const front = new File(['front'], 'front.png', { type: 'image/png' });
  const back = new File(['back'], 'back.png', { type: 'image/png' });
  fireEvent.change(photos[0], { target: { files: [front] } });
  fireEvent.change(photos[0], { target: { files: [back] } });
  expect(screen.queryByLabelText('Take a photo for unit 1')).not.toBeInTheDocument();
  expect(screen.getByText('1. front.png')).toBeInTheDocument();
  expect(screen.getByText('2. back.png')).toBeInTheDocument();
  fireEvent.change(photos[1], { target: { files: [front] } });
  fillRequiredReceivingFields();
  fireEvent.click(screen.getByText('Receive 2 units'));
  await screen.findByText('2 units received');
  const body = receivingApi.mock.calls[1][1].body;
  expect(body.getAll('unitImages_0').map(file => file.name)).toEqual(['front.png', 'back.png']);
  expect(body.getAll('unitImages_1').map(file => file.name)).toEqual(['front.png']);
});

test('staff can append multiple photos to an existing unit without replacing its photos', async () => {
  receivingApi.mockResolvedValueOnce({ item: { id: 1, fileNo: 'sid-0001', images: [], unitImages: ['/old.png'], siblings: [] } })
    .mockResolvedValueOnce({ unitImages: ['/old.png', '/front.png', '/back.png'], message: '2 unit photo(s) added.' });
  render(<ReturnReceivingDetails />);
  const picker = await screen.findByLabelText('Additional unit photos');
  fireEvent.change(picker, { target: { files: [new File(['a'], 'front.png', { type: 'image/png' }), new File(['b'], 'back.png', { type: 'image/png' })] } });
  expect(await screen.findByAltText('Selected photo: front.png')).toHaveAttribute('src', 'blob:preview-front.png');
  fireEvent.click(screen.getByRole('button', { name: 'Save unit photos' }));
  await screen.findByText('2 unit photo(s) added.');
  expect(screen.getByText('Unit photos · 3')).toBeInTheDocument();
  expect(receivingApi.mock.calls[1][0]).toBe('/units/sid-0001/photos');
  expect(receivingApi.mock.calls[1][1].body.getAll('images')).toHaveLength(2);
  expect(screen.getByAltText('Unit photos 1')).toHaveAttribute('src', 'http://localhost:8088/old.png');
});

test('previews shared and unit photos without submitting and releases removed preview files', async () => {
  receivingApi.mockResolvedValueOnce({ companies: ['Others'] })
    .mockResolvedValueOnce({ quantity: 1, fileNos: ['sid-0001'] });
  render(<ReturnReceivingInput />);
  await screen.findByRole('option', { name: 'Others' });
  fillRequiredReceivingFields();
  fireEvent.change(screen.getByLabelText('Shared shipping label photos'), { target: { files: [new File(['label'], 'label.png', { type: 'image/png' })] } });
  fireEvent.change(screen.getByLabelText('Unit photos'), { target: { files: [new File(['unit'], 'unit.png', { type: 'image/png' })] } });
  expect(await screen.findByAltText('Selected photo: label.png')).toHaveAttribute('src', 'blob:preview-label.png');
  expect(screen.getByAltText('Selected photo: unit.png')).toHaveAttribute('src', 'blob:preview-unit.png');
  const trigger = screen.getByRole('button', { name: 'Preview Shared shipping label photos photo 1' });
  fireEvent.click(trigger);
  const dialog = screen.getByRole('dialog', { name: 'Photo preview: label.png' });
  expect(within(dialog).getByAltText('Full preview: label.png')).toHaveAttribute('src', 'blob:preview-label.png');
  expect(document.body.style.overflow).toBe('hidden');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Close preview' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
  expect(document.body.style.overflow).not.toBe('hidden');
  fireEvent.click(trigger);
  fireEvent(screen.getByRole('dialog'), new Event('cancel', { bubbles: false }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Remove selected photo 1 from Shared shipping label photos' }));
  expect(screen.queryByAltText('Selected photo: label.png')).not.toBeInTheDocument();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview-label.png');
  expect(receivingApi).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByText('Receive 1 unit'));
  await screen.findByText('1 unit received');
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview-unit.png');
  const body = receivingApi.mock.calls[1][1].body;
  expect(body.getAll('images')).toEqual([]);
  expect(body.getAll('unitImages_0').map(file => file.name)).toEqual(['unit.png']);
});

test('receiving uses company options supplied by the admin settings', async () => {
  receivingApi.mockResolvedValueOnce({ companies: ['Custom Logistics'] })
    .mockResolvedValueOnce({ quantity: 1, fileNos: ['sid-0009'] });
  render(<ReturnReceivingInput />);
  await screen.findByRole('option', { name: 'Custom Logistics' });
  expect(screen.queryByRole('option', { name: 'Others' })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Company'), { target: { value: 'Custom Logistics' } });
  fillRequiredReceivingFields();
  fireEvent.click(screen.getByText('Receive 1 unit'));
  await screen.findByText('1 unit received');
  expect(JSON.parse(receivingApi.mock.calls[1][1].body.get('payload')).company).toBe('Custom Logistics');
});

test('quantity creates individual unit fields and preserves existing unit information', async () => {
  receivingApi.mockResolvedValue({ companies: ['Others'] });
  render(<ReturnReceivingInput />);
  await screen.findByRole('option', { name: 'Others' });
  fireEvent.change(screen.getByLabelText('UPC/Item code'), { target: { value: '001234567890' } });
  fireEvent.change(screen.getByLabelText('Quantity in this delivery'), { target: { value: '3' } });
  expect(screen.getAllByLabelText('UPC/Item code')).toHaveLength(3);
  expect(screen.getAllByLabelText('UPC/Item code')[0]).toHaveValue('001234567890');
  expect(screen.getAllByLabelText('Unit photos')).toHaveLength(3);
});

test('company filter follows admin options and clears renamed selections on refresh', async () => {
  receivingApi.mockResolvedValueOnce({ companies: ['Acme', 'Unused company'], items: [
    { id: 1, fileNo: 'sid-0001', company: 'Acme', tracking: 'A' },
    { id: 2, fileNo: 'sid-0002', company: 'Legacy company', tracking: 'B' },
  ] }).mockResolvedValueOnce({ companies: ['Acme Logistics', 'Unused company'], items: [
    { id: 1, fileNo: 'sid-0001', company: 'Acme Logistics', tracking: 'A' },
    { id: 2, fileNo: 'sid-0002', company: 'Legacy company', tracking: 'B' },
  ] });
  render(<ReturnReceivingList />);
  await screen.findByRole('option', { name: 'Unused company' });
  expect(screen.getByRole('option', { name: 'Legacy company' })).toBeInTheDocument();
  expect(screen.queryByRole('option', { name: 'SNOWBELL/XIE/PITY TECH' })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Company'), { target: { value: 'Acme' } });
  expect(screen.queryByRole('link', { name: 'sid-0002' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Refresh', exact: true }));
  await screen.findByRole('option', { name: 'Acme Logistics' });
  expect(screen.queryByRole('option', { name: 'Acme', exact: true })).not.toBeInTheDocument();
  expect(screen.getByLabelText('Company')).toHaveValue('');
  expect(screen.getByRole('link', { name: 'sid-0002' })).toBeInTheDocument();
});

test('staff can see all companies and open a specific printed file number', async () => {
  receivingApi.mockImplementation(path => Promise.resolve(path === '/units' ? { items: [
    { id: 1, fileNo: 'sid-0001', tracking: 'A', company: 'Others' },
    { id: 2, fileNo: 'sid-0002', tracking: 'B', company: 'SNOWBELL/XIE/PITY TECH' },
  ] } : { item: { fileNo: 'sid-0001' } }));
  render(<ReturnReceivingList department="SnowBell" />);
  await screen.findByRole('link', { name: 'sid-0001' });
  expect(screen.getByRole('link', { name: 'sid-0002' })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Open unit by ID or File Number'), { target: { value: ' SID-0001 ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Open unit' }));
  await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/return/sid-0001', { state: { returnTo: '/return' } }));
  expect(receivingApi).toHaveBeenCalledWith('/units/SID-0001');
});

test('printing file labels selects label-only printing and restores the normal page', async () => {
  receivingApi.mockResolvedValue({ item: { id: 1, fileNo: 'sid-0001', laptop: 'Dell', unitIndex: 1, groupSize: 1, images: [], unitImages: [], siblings: [] } });
  const printing = jest.spyOn(window, 'print').mockImplementation(() => {
    expect(document.body).toHaveClass('receiving-print-labels');
    expect(document.querySelectorAll('.receiving-file-label')).toHaveLength(1);
    expect(document.querySelector('.receiving-label-number')).toHaveTextContent('sid-0001');
  });
  render(<ReturnReceivingDetails />);
  fireEvent.click(await screen.findByRole('button', { name: 'Print file label' }));
  expect(printing).toHaveBeenCalledTimes(1);
  expect(document.body).not.toHaveClass('receiving-print-labels');
  printing.mockRestore();
});

test('groups matching tracking across deliveries and keeps untracked deliveries separate', async () => {
  receivingApi.mockResolvedValue({ items: [
    { id: 5, fileNo: 'sid-0005', tracking: 'SAME', groupId: 'delivery-two' },
    { id: 4, fileNo: 'sid-0004', tracking: 'OTHER' },
    { id: 3, fileNo: 'sid-0003', tracking: ' SAME ', groupId: 'delivery-one' },
    { id: 2, fileNo: 'sid-0002', tracking: '', groupId: 'untracked-two' },
    { id: 1, fileNo: 'sid-0001', tracking: '', groupId: 'untracked-one' },
  ] });
  render(<ReturnReceivingList />);
  const group = await screen.findByRole('button', { name: /Tracking # SAME/ });
  const body = within(group.closest('tbody'));
  expect(body.getByRole('link', { name: 'sid-0005' })).toBeInTheDocument();
  expect(body.getByRole('link', { name: 'sid-0003' })).toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: /No tracking number/ })).toHaveLength(2);
  fireEvent.click(group);
  expect(group).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByRole('link', { name: 'sid-0003' })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Search returns'), { target: { value: 'sid-0003' } });
  expect(screen.getByRole('link', { name: 'sid-0003' })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'sid-0005' })).not.toBeInTheDocument();
});

test('pagination keeps all units with the same tracking number on one page', async () => {
  const items = Array.from({ length: 110 }, (_, index) => ({
    id: index + 1, fileNo: 'sid-' + String(index + 1).padStart(4, '0'),
    tracking: index < 60 ? 'LARGE-GROUP' : 'OTHER-' + (index - 60),
  }));
  receivingApi.mockResolvedValue({ items });
  render(<ReturnReceivingList />);
  fireEvent.click(screen.getByRole('button', { name: 'Sort by File no. ascending' }));
  await screen.findByRole('button', { name: /Tracking # LARGE-GROUP/ });
  expect(screen.getByRole('link', { name: 'sid-0060' })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'sid-0110' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByRole('link', { name: 'sid-0110' })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'sid-0060' })).not.toBeInTheDocument();
});

test('receives distinct items with individual UPCs, serial numbers and file numbers', async () => {
  receivingApi.mockResolvedValueOnce({ companies: ['SNOWBELL/XIE/PITY TECH', 'Others'] }).mockResolvedValueOnce({ quantity: 2, fileNos: ['sid-0007', 'sid-0008'] });
  render(<ReturnReceivingInput department="SnowBell" />);
  await screen.findByRole('option', { name: 'Others' });
  fireEvent.change(screen.getByLabelText('Tracking #'), { target: { value: 'TRACK-7' } });
  fireEvent.change(screen.getByLabelText('Company'), { target: { value: 'SNOWBELL/XIE/PITY TECH' } });
  fireEvent.change(screen.getByLabelText('UPC/Item code'), { target: { value: '001234567890' } });
  fireEvent.change(screen.getByLabelText('Serial number'), { target: { value: 'SERIAL-7' } });
  fireEvent.change(screen.getByLabelText('UPC/Item code'), { target: { value: '001234567890' } });
  fireEvent.change(screen.getByLabelText('Other information'), { target: { value: 'Black; USB receiver included' } });
  fireEvent.click(screen.getByText('+ Add item'));
  fireEvent.change(screen.getAllByLabelText('UPC/Item code')[1], { target: { value: 'Lenovo' } });
  fireEvent.change(screen.getAllByLabelText('Serial number')[1], { target: { value: 'SERIAL-8' } });
  fireEvent.click(screen.getByText('Receive 2 units'));
  await screen.findByText('2 units received');
  expect(screen.getByRole('link', { name: 'sid-0007' })).toHaveAttribute('href', '/return/sid-0007');
  const body = receivingApi.mock.calls.find(([path]) => path === '/units')[1].body;
  expect(JSON.parse(body.get('payload'))).toEqual({ tracking: 'TRACK-7', receivedDate: '2026-09-30', remark: '', company: 'SNOWBELL/XIE/PITY TECH', quantity: 2, units: [{ upc: '001234567890', itemInfo: 'Black; USB receiver included', serial: 'SERIAL-7' }, { upc: 'Lenovo', itemInfo: '', serial: 'SERIAL-8' }] });
});

test('requires delivery fields and every item code without requiring serials or submitting on Enter', async () => {
  receivingApi.mockResolvedValueOnce({ companies: ['Others'] })
    .mockResolvedValueOnce({ quantity: 2, fileNos: ['sid-0001', 'sid-0002'] });
  render(<ReturnReceivingInput />);
  await screen.findByRole('option', { name: 'Others' });
  fillRequiredReceivingFields();
  const form = screen.getByLabelText('Tracking #').closest('form');
  for (const [label, emptyValue, message] of [
    ['Tracking #', '   ', 'Tracking number is required.'],
    ['Received date', '', 'Received date is required.'],
    ['Company', '', 'Company is required.'],
    ['Quantity in this delivery', '', 'Quantity must be a whole number from 1 to 100.'],
    ['UPC/Item code', '   ', 'UPC/Item code for item 1 is required.'],
  ]) {
    const field = screen.getByLabelText(label);
    expect(field).toBeRequired();
    const previous = field.value;
    fireEvent.change(field, { target: { value: emptyValue } });
    fireEvent.submit(form);
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(receivingApi).toHaveBeenCalledTimes(1);
    fireEvent.change(field, { target: { value: previous } });
  }
  expect(screen.getByLabelText('Serial number')).not.toBeRequired();
  expect(screen.getByLabelText('Other information')).not.toBeRequired();
  fireEvent.click(screen.getByText('+ Add item'));
  fireEvent.submit(form);
  expect(await screen.findByRole('alert')).toHaveTextContent('UPC/Item code for item 2 is required.');
  expect(receivingApi).toHaveBeenCalledTimes(1);
  const secondCode = screen.getAllByLabelText('UPC/Item code')[1];
  expect(secondCode).toBeRequired();
  fireEvent.change(secondCode, { target: { value: '00123' } });
  expect(fireEvent.keyDown(secondCode, { key: 'Enter', code: 'Enter', charCode: 13 })).toBe(false);
  expect(fireEvent.keyDown(screen.getByLabelText('Receiving remark'), { key: 'Enter' })).toBe(true);
  expect(receivingApi).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByText('Receive 2 units'));
  await screen.findByText('2 units received');
  const payload = JSON.parse(receivingApi.mock.calls[1][1].body.get('payload'));
  expect(payload.units.map(unit => unit.serial)).toEqual(['', '']);
});

test('department company access is saved separately and Allow all actions does not grant all companies', async () => {
  const catalog = [
    { key: 'return.view', label: 'View returns', group: '3PL' },
    { key: 'return.ship', label: 'Ship units', group: '3PL' },
    { key: 'company.all', label: 'Access all companies (internal staff only)', group: 'Company access' },
  ];
  const data = { companies: ['SNOWBELL', 'PC Online'], departments: [{ name: 'SnowBell', companies: [], permissions: ['return.view'] }], catalog };
  receivingApi.mockResolvedValueOnce(data).mockResolvedValueOnce({ ...data, departments: [{ name: 'SnowBell', companies: ['SNOWBELL'], permissions: ['return.view', 'return.ship'] }], message: 'Company access saved.' });
  render(<DepartmentSettings />);
  await screen.findByRole('option', { name: 'SnowBell' });
  fireEvent.change(screen.getByLabelText('Department to manage'), { target: { value: 'SnowBell' } });
  fireEvent.click(screen.getByLabelText('Allow company SNOWBELL'));
  fireEvent.click(screen.getByRole('button', { name: 'Allow all actions' }));
  expect(screen.getByLabelText('Access all companies (internal staff only)')).not.toBeChecked();
  expect(screen.getByLabelText('Allow company PC Online')).not.toBeChecked();
  fireEvent.click(screen.getByRole('button', { name: 'Save department permissions' }));
  await screen.findByText('Company access saved.');
  expect(JSON.parse(receivingApi.mock.calls[1][1].body)).toEqual({ name: 'SnowBell', newName: 'SnowBell', permissions: ['return.view', 'return.ship'], companies: ['SNOWBELL'] });
  expect(screen.getByLabelText('Allow company SNOWBELL')).toBeChecked();
});

test('receiving rejects duplicate serials and preserves them while quantity changes', async () => {
  receivingApi.mockResolvedValue({ companies: ['Others'] });
  render(<ReturnReceivingInput />);
  await screen.findByRole('option', { name: 'Others' });
  fireEvent.change(screen.getByLabelText('Serial number'), { target: { value: 'ITEM-1' } });
  fireEvent.change(screen.getByLabelText('Quantity in this delivery'), { target: { value: '2' } });
  expect(screen.getAllByLabelText('Serial number')[0]).toHaveValue('ITEM-1');
  fireEvent.change(screen.getAllByLabelText('Serial number')[1], { target: { value: ' item-1 ' } });
  fillRequiredReceivingFields();
  fireEvent.click(screen.getByText('Receive 2 units'));
  await screen.findByText(/Each item must have a different serial number/);
  expect(receivingApi).toHaveBeenCalledTimes(1);
  expect(screen.getAllByLabelText('Serial number')[1]).toHaveValue(' item-1 ');
});

test('inspection starts with the serial saved during receiving', async () => {
  receivingApi.mockResolvedValue({ item: { id: 1, fileNo: 'sid-0001', laptop: 'Keyboard', serial: 'KEY-100', images: [], unitImages: [], siblings: [] } });
  render(<ReturnReceivingDetails />);
  expect(await screen.findByLabelText('Serial number')).toHaveValue('KEY-100');
});

test('failed receiving keeps entered information available for retry', async () => {
  receivingApi.mockResolvedValueOnce({ companies: ['Others'] }).mockRejectedValue(new Error('Storage unavailable'));
  render(<ReturnReceivingInput />);
  await screen.findByRole('option', { name: 'Others' });
  fillRequiredReceivingFields();
  fireEvent.change(screen.getByLabelText('Tracking #'), { target: { value: 'KEEP-THIS' } });
  fireEvent.click(screen.getByText('Receive 1 unit'));
  expect(await screen.findByRole('alert')).toHaveTextContent('Storage unavailable');
  expect(screen.getByLabelText('Tracking #')).toHaveValue('KEEP-THIS');
  expect(screen.getByText('Receive 1 unit')).toBeEnabled();
});

test('locked and full pallets remain visible but disabled for assignment', () => {
  render(<PalletField value="P-LOCK" onChange={jest.fn()} pallets={[
    { pallet: 'P-OPEN', total: 2, status: 'OPEN' }, { pallet: 'P-LOCK', total: 3, status: 'LOCKED' }, { pallet: 'P-FULL', total: 4, status: 'FULL' },
  ]} />);
  expect(screen.getByRole('option', { name: /P-OPEN/ })).toBeEnabled();
  expect(screen.getByRole('option', { name: /P-LOCK/ })).toBeDisabled();
  expect(screen.getByRole('option', { name: /P-FULL/ })).toBeDisabled();
  expect(screen.getByLabelText('Pallet')).toHaveValue('existing:P-LOCK');
});

test('pallet overview saves Full status and can reopen the pallet', async () => {
  let status = 'OPEN';
  receivingApi.mockImplementation(path => Promise.resolve(path === '/pallets' ? { pallets: [{ pallet: 'P1', total: 1, ready: 1, shipped: 0, status }] } : { items: [] }));
  postJson.mockImplementation((path, payload) => { status = payload.status; return Promise.resolve({ message: 'Pallet status saved.' }); });
  render(<ReturnReceivingShip />);
  const control = await screen.findByLabelText('Status for pallet P1');
  fireEvent.change(control, { target: { value: 'FULL' } });
  await waitFor(() => expect(control).toHaveValue('FULL'));
  expect(postJson).toHaveBeenLastCalledWith('/pallet-status', { pallet: 'P1', status: 'FULL' });
  await waitFor(() => expect(control).toBeEnabled());
  fireEvent.change(control, { target: { value: 'OPEN' } });
  await waitFor(() => expect(control).toHaveValue('OPEN'));
  expect(postJson).toHaveBeenLastCalledWith('/pallet-status', { pallet: 'P1', status: 'OPEN' });
});

test('inspection can select an existing unshipped pallet or enter a new pallet', async () => {
  receivingApi.mockResolvedValue({ item: { id: 1, fileNo: 'sid-0001', images: [], unitImages: [], siblings: [] }, availablePallets: [{ pallet: 'P-OPEN', total: 12 }] });
  postJson.mockResolvedValue({});
  render(<ReturnReceivingDetails />);
  const pallet = await screen.findByLabelText('Pallet');
  expect(screen.getByRole('option', { name: 'P-OPEN · 12 unshipped units' })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Serial number'), { target: { value: 'PALLET-TEST' } });
  fireEvent.change(pallet, { target: { value: 'existing:P-OPEN' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save inspection' }));
  await screen.findByText('Inspection saved.');
  expect(postJson).toHaveBeenLastCalledWith('/units/sid-0001/inspection', expect.objectContaining({ pallet: 'P-OPEN' }));
  fireEvent.change(pallet, { target: { value: 'new' } });
  fireEvent.change(screen.getByLabelText('Pallet name'), { target: { value: 'P-NEW' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save inspection' }));
  await waitFor(() => expect(postJson).toHaveBeenLastCalledWith('/units/sid-0001/inspection', expect.objectContaining({ pallet: 'P-NEW' })));
});

test('duplicate serial error is shown without clearing the inspection', async () => {
  receivingApi.mockResolvedValue({ item: { id: 1, fileNo: 'sid-0001', laptop: 'Dell', unitIndex: 1, groupSize: 1, tracking: 'TRACK', images: [], unitImages: [], siblings: [] } });
  postJson.mockRejectedValue(new Error('This serial number is already assigned to another unit.'));
  render(<ReturnReceivingDetails />);
  const serial = await screen.findByLabelText('Serial number');
  fireEvent.change(serial, { target: { value: 'DUPLICATE' } });
  fireEvent.click(screen.getByText('Save inspection'));
  expect(await screen.findByRole('alert')).toHaveTextContent('already assigned');
  expect(serial).toHaveValue('DUPLICATE');
  expect(postJson).toHaveBeenCalledWith('/units/sid-0001/inspection', expect.objectContaining({ serial: 'DUPLICATE', inspectionDate: '2026-09-30' }));
});

test('shipping selection excludes uninspected and already shipped units', async () => {
  const units = [
    { id: 1, fileNo: 'sid-0001', pallet: 'P1', inspectionDate: '2026-09-29' },
    { id: 2, fileNo: 'sid-0002', pallet: 'P1' },
    { id: 3, fileNo: 'sid-0003', pallet: 'P1', inspectionDate: '2026-09-29', shipDate: '2026-09-30' },
  ];
  receivingApi.mockImplementation(path => Promise.resolve(path === '/pallets' ? { pallets: [{ pallet: 'P1', total: 3, ready: 1, shipped: 1 }] } : { items: units }));
  postJson.mockResolvedValue({ shippedCount: 1, batchId: 'ship.0001', skipped: [] });
  render(<ReturnReceivingShip />);
  fireEvent.click(await screen.findByRole('button', { name: 'View units' }));
  await screen.findByLabelText('Select sid-0001');
  await waitFor(() => expect(screen.getByLabelText('Select sid-0001')).toBeEnabled());
  expect(screen.getByLabelText('Select sid-0002')).toBeDisabled();
  expect(screen.getByLabelText('Select sid-0003')).toBeDisabled();
  fireEvent.click(screen.getByText('Select ready units'));
  fireEvent.click(screen.getByText('Ship 1 selected units'));
  await screen.findByText('1 units shipped · ship.0001');
  expect(postJson).toHaveBeenCalledWith('/ship', { shipDate: '2026-09-30', unitIds: [1] });
});

test('pallet viewers can check contents and batches across pallets without shipping controls', async () => {
  require('../common/access').canPermission.mockImplementation(action => ['return.view', 'return.pallet_view'].includes(action));
  const units = [
    { id: 1, fileNo: 'sid-0001', pallet: 'P1', inspectionDate: '2026-09-29' },
    { id: 2, fileNo: 'sid-0002', pallet: 'P1', inspectionDate: '2026-09-29', shipDate: '2026-09-30', shipBatch: 'ship.0099' },
    { id: 3, fileNo: 'sid-0003', pallet: 'P2', inspectionDate: '2026-09-29', shipDate: '2026-09-30', shipBatch: 'ship.0099' },
    { id: 4, fileNo: 'sid-0004', pallet: 'P1', inspectionDate: '2026-09-29', shipDate: '2026-09-29', shipBatch: 'ship.0098' },
  ];
  receivingApi.mockImplementation(path => Promise.resolve(path === '/pallets' ? { pallets: [
    { pallet: 'P1', total: 3, ready: 1, shipped: 2, status: 'LOCKED' }, { pallet: 'P2', total: 1, ready: 0, shipped: 1 },
  ] } : { items: units }));
  render(<ReturnReceivingShip />);
  const buttons = await screen.findAllByRole('button', { name: 'View units' });
  expect(screen.getByRole('heading', { name: 'Pallets & shipments' })).toBeInTheDocument();
  expect(screen.queryByRole('combobox', { name: 'Status for pallet P1' })).not.toBeInTheDocument();
  fireEvent.click(buttons[0]);
  let region = screen.getByRole('region', { name: 'All units on pallet P1' });
  expect(within(region).getAllByRole('link')).toHaveLength(3);
  expect(within(region).queryByRole('checkbox')).not.toBeInTheDocument();
  expect(within(region).queryByLabelText('Ship date')).not.toBeInTheDocument();
  expect(within(region).queryByRole('button', { name: /Ship \d/ })).not.toBeInTheDocument();
  expect(within(region).getByText('ship.0099')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Close pallet units' }));
  const batchRow = screen.getByText('ship.0099').closest('tr');
  expect(within(batchRow).getByText('P1, P2')).toBeInTheDocument();
  fireEvent.click(within(batchRow).getByRole('button', { name: 'View shipped units' }));
  region = screen.getByRole('region', { name: 'Shipped units' });
  expect(within(region).getAllByRole('link').map(link => link.textContent)).toEqual(['sid-0002', 'sid-0003']);
  expect(within(region).queryByRole('checkbox')).not.toBeInTheDocument();
  expect(postJson).not.toHaveBeenCalled();
});

test('view units opens all pallet units immediately in a dialog with shipping controls', async () => {
  postJson.mockResolvedValue({ shippedCount: 1, batchId: 'ship.0002', skipped: [] });
  const units = [
    { id: 1, fileNo: 'sid-0001', pallet: 'P1', tracking: 'TRACK-1', inspectionDate: '2026-09-29' },
    { id: 2, fileNo: 'sid-0002', pallet: 'P1' },
    { id: 3, fileNo: 'sid-0003', pallet: 'P1', inspectionDate: '2026-09-29', shipDate: '2026-09-30' },
    { id: 4, fileNo: 'sid-0004', pallet: 'P2', inspectionDate: '2026-09-29' },
  ];
  receivingApi.mockImplementation(path => Promise.resolve(path === '/pallets' ? { pallets: [
    { pallet: 'P1', total: 3, ready: 1, shipped: 1 }, { pallet: 'P2', total: 1, ready: 1, shipped: 0 },
  ] } : { items: units }));
  render(<ReturnReceivingShip />);
  const buttons = await screen.findAllByRole('button', { name: 'View units' });
  expect(screen.queryByRole('link', { name: 'sid-0001' })).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Ship date')).not.toBeInTheDocument();
  fireEvent.click(buttons[0]);
  const region = screen.getByRole('region', { name: 'All units on pallet P1' });
  expect(region.closest('dialog')).toHaveAttribute('open');
  expect(document.body.style.overflow).toBe('hidden');
  expect(within(region).getAllByRole('link')).toHaveLength(3);
  expect(within(region).queryByRole('link', { name: 'sid-0004' })).not.toBeInTheDocument();
  expect(within(region).getByLabelText('Select sid-0002')).toBeDisabled();
  expect(within(region).getByLabelText('Select sid-0003')).toBeDisabled();
  fireEvent.click(within(region).getByLabelText('Select sid-0001'));
  expect(screen.getByRole('button', { name: 'Ship 1 selected units' })).toBeEnabled();
  expect(screen.getAllByLabelText('Select sid-0001')).toHaveLength(1);
  expect(within(region).getByLabelText('Ship date')).toBeInTheDocument();
  expect(within(region).getByRole('button', { name: 'Ship 1 selected units' })).toBeEnabled();
  fireEvent.click(within(region).getByRole('button', { name: 'Ship 1 selected units' }));
  await within(screen.getByRole('dialog')).findByText('1 units shipped · ship.0002');
  expect(postJson).toHaveBeenCalledWith('/ship', { shipDate: '2026-09-30', unitIds: [1] });
  fireEvent.click(screen.getByRole('button', { name: 'Close pallet units' }));
  expect(document.body.style.overflow).not.toBe('hidden');
  fireEvent.click(screen.getAllByRole('button', { name: 'View units' })[1]);
  expect(screen.queryByRole('region', { name: 'All units on pallet P1' })).not.toBeInTheDocument();
  expect(within(screen.getByRole('region', { name: 'All units on pallet P2' })).getByRole('link', { name: 'sid-0004' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Ship 0 selected units' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Close pallet units' }));
  expect(screen.queryByRole('region', { name: 'All units on pallet P2' })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'sid-0004' })).not.toBeInTheDocument();
});
