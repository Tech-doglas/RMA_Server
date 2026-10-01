import { readList, requireOk } from '../common/requestResult';
import { apiFetch } from '../common/access';
import React, { useEffect, useState, useCallback, useRef } from 'react';
import GenericList from '../common/GenericList';
import { gradeMapping } from '../common/GradeMapping'

function NonPCList() {
  const [nonLaptops, set_nonLaptops] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const searchVersion = useRef(0);
  const lastSearch = useRef({});

  const columns = [
    { key: 'ReceivedDate', label: 'Rec Date', defaultVisible: false },
    { key: 'TrackingNumber', label: 'Tracking#' },
    { key: 'Name', label: 'Name' },
    { key: 'Location', label: 'Location', defaultVisible: false },
    { key: 'OdooRef', label: 'Odoo Code' },
    { key: 'OdooRecord', label: 'Odoo Record', render: (item) => item.OdooRecord ? '✅' : '❌' },
    { key: 'SKU', label: 'SKU' },
    { key: 'OrderNumber', label: 'Order Number' },
    { key: 'Category', label: 'Category', render: (item) => item.Category === 'Electronic' ? 'Electronic Devices' : item.Category , defaultVisible: false },
    {
      key: 'InspectionRequest', label: 'Inspection Request', render: (item) => {
        if (item.InspectionRequest === 'A') return 'Full inspection';
        return item.InspectionRequest;
      }
    },
    {
      key: 'Condition',
      label: 'Condition',
      render: (item) => {
        if (!item.Condition) return '';
        return gradeMapping(item.Condition)
      }
    },
    { key: 'ReadyToSale', label: 'Ready To Sale', render: (item) => item.ReadyToSale ? '✅' : '❌' },
  ];

  const searchFields = [
    { name: 'trackingNumber', label: 'Tracking #', key: 'TrackingNumber', type: 'text', placeholder: 'Enter tracking number' },
    { name: 'name', label: 'Name', key: 'Name', type: 'text', placeholder: 'Enter name' },
  ];

  const filterFields = [
    {
      name: 'category',
      label: 'Category',
      key: 'Category',
      type: 'select',
      options: [
        { value: '', label: 'All Categories' },
        { value: 'Electronic', label: 'Electronic Devices' },
        { value: 'Printer', label: 'Printer' },
        { value: 'Monitor', label: 'Monitor' },
        { value: 'Gaming Console', label: 'Gaming console' },
        { value: 'Other', label: 'Other' },
      ],
    },
    {
      name: 'inspectionRequest',
      label: 'Inspection Request',
      key: 'InspectionRequest',
      type: 'multiselect',
      options: [
        { value: 'A', label: 'Full inspection' }
      ],
    },
    {
      name: 'conditions',
      label: 'Condition',
      key: 'Condition',
      type: 'multiselect',
      options: [
        { value: 'N', label: 'Back to New' },
        { value: "W", label: "Brand New" },
        { value: 'A', label: 'Grade A' },
        { value: 'B', label: 'Grade B' },
        { value: 'C', label: 'Grade C' },
        { value: 'F', label: 'Grade F' },
      ],
    },
    {
      name: 'readyToSale',
      label: 'Ready To Sale',
      key: 'ReadyToSale',
      type: 'checkbox',
      options: [
        { value: 'Ready', label: 'Ready' },
        { value: 'Not yet', label: 'Not yet' },
      ],
      getValue: (item) => item.ReadyToSale ? 'Ready' : 'Not yet',
    },
    {
      name: 'orderDistributed',
      label: 'Order Distributed',
      key: 'OrderDistributed',
      type: 'checkbox',
      options: [
        { value: 'Distributed', label: 'Distributed' },
        { value: 'Not yet', label: 'Not yet' },
      ],
      getValue: (item) => item.OrderDistributed ? 'Distributed' : 'Not yet',
    },
    {
      name: 'hasOrderNumber',
      label: 'Order Number',
      key: 'HasOrderNumber',
      type: 'checkbox',
      options: [
        { value: 'Yes', label: 'Order Number' },
      ],
      getValue: (item) => (item.OrderNumber ? 'Yes' : 'No'),
}
  ];

  const actions = [
    { name: 'Details Check', action: (ids) => handleDetailsCheck(ids)},
    { name: 'Ready To Sale', action: (ids) => handleReadyToSale(ids)},
  ]

  const handleSearch = useCallback(async (searchParams = {}) => {
    const version = ++searchVersion.current;
    lastSearch.current = searchParams;
    setLoading(true);
    setError('');
    try {
      const response = await apiFetch(`http://${window.location.hostname}:8088/non_laptop/api/search`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(searchParams),
      });
      const data = await readList(response);
      if (version === searchVersion.current) set_nonLaptops(data);
    } catch (failure) {
      if (version === searchVersion.current) setError(failure.message || 'Unable to load items. Please try again.');
    } finally {
      if (version === searchVersion.current) setLoading(false);
    }
  }, []);
  const updateSelected = async (endpoint, ids) => {
    const response = await apiFetch(`http://${window.location.hostname}:8088/non_laptop/api/${endpoint}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }),
    });
    await requireOk(response);
    await handleSearch(lastSearch.current);
  };
  const handleDetailsCheck = ids => updateSelected('updaterequest', ids);
  const handleReadyToSale = ids => updateSelected('saleready', ids);

  useEffect(() => {
    handleSearch({});
    return () => { searchVersion.current += 1; };
  }, [handleSearch]);


  return (
    <GenericList
      items={nonLaptops}
      columns={columns}
      searchFields={searchFields}
      filterFields={filterFields}
      basePath="/non-pc"
      itemKey="ID"
      onSearch={handleSearch}
      loading={loading}
      error={error}
      actions={actions}
    />
  );
}

export default NonPCList;