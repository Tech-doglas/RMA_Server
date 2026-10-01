const VIEW_PERMISSIONS = new Set(['return.view', 'return.pallet_view', 'return.report', 'pc.view', 'nonpc.view', 'legacy.view', 'xie.view', 'directory.view']);
const DOWNLOAD_PERMISSIONS = new Set(['return.export', 'return.print', 'pc.report']);

export function permissionKind(action) {
  if (VIEW_PERMISSIONS.has(action.key)) return 'view';
  if (DOWNLOAD_PERMISSIONS.has(action.key)) return 'download';
  if (action.key.endsWith('.delete')) return 'delete';
  return 'update';
}

// Shipping and pallet managers can also read pallets without a separate view grant.
export function includedViewingPermissions(permissions) {
  return new Set(permissions.some(key => ['return.ship', 'return.pallet_status'].includes(key)) ? ['return.pallet_view'] : []);
}

export const permissionHelp = {
  'return.view': 'Read return records and attached photos.',
  'return.pallet_view': 'See pallet contents, shipped units, dates, and batches.',
  'return.report': 'Read monthly receiving, inspection, and shipping totals.',
  'return.receive': 'Create deliveries and individual unit records.',
  'return.photos': 'Attach new photos to a unit.',
  'return.inspect': 'Save inspection details, serial numbers, and pallet assignments.',
  'return.classify': 'Change the bulk type for units sharing a tracking number.',
  'return.pallet_status': 'Change a pallet between Open, Locked, and Full.',
  'return.ship': 'Create shipping batches and mark eligible units as shipped.',
  'return.edit': 'Change saved return details. Shipping and inspection still need their own permissions.',
  'return.delete': 'Remove return records from active lists.',
  'return.restore': 'Put previously removed return records back into the system.',
  'return.export': 'Download return data as CSV or JSON; records stay unchanged.',
  'return.print': 'Print file labels and unit records; records stay unchanged.',
  'pc.report': 'Download inventory reports; records stay unchanged.',
  'pc.inspect': 'Mark technical work as complete.',
  'nonpc.request': 'Change the inspection request status of selected items.',
  'nonpc.ready': 'Mark inspected items ready for sale.',
  'nonpc.distribute': 'Mark an order as distributed.',
  'legacy.edit': 'Change previous receiving records, classification, and recorded status.',
  'xie.request': 'Access the request workflow when it is configured.',
  'directory.view': 'See active staff names when attributing records.',
};

export function actionHelp(action) {
  if (permissionHelp[action.key]) return permissionHelp[action.key];
  if (action.key.endsWith('.view')) return 'Read records and photos without changing them.';
  if (action.key.endsWith('.create')) return 'Add new records to this workspace.';
  if (action.key.endsWith('.edit')) return 'Update information in existing records.';
  if (action.key.endsWith('.delete')) return 'Delete records from this workspace.';
  if (action.key.endsWith('.sell')) return 'Save sales information and update sold status.';
  if (action.key.endsWith('.photos')) return action.key === 'xie.photos' ? 'Upload photos with SnowBell records.' : 'Upload or remove photos attached to records.';
  return 'Allow this action in the workspace.';
}

// Match the server's rule: an action also requires viewing its workspace.
export function viewingDependencies(permissions, catalog) {
  const known = new Set(catalog.map(action => action.key));
  return new Set(permissions.flatMap(key => {
    const view = key.split('.')[0] + '.view';
    return key !== view && known.has(view) ? [view] : [];
  }));
}
