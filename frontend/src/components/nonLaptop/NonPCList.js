import React, {useEffect, useState} from 'react';
import GenericList from '../common/GenericList';

function NonPCList() {
  const [nonLaptops, set_nonLaptops] = useState([]);

  const columns = [
    { key: 'ReceivedDate', label: 'Rec Date', defaultVisible: false },
    { key: 'TrackingNumber', label: 'Tracking#' },
    { key: 'Name', label: 'Name' },
    { key: 'Location', label: 'Location' },
    { key: 'OdooRef', label: 'Odoo Code' },
    { key: 'SKU', label: 'SKU' },
    { key: 'OrderNumber', label: 'Order Number' },
    { key: 'Category', label: 'Category', render: (item) => item.Category === 'Electronic' ? 'Electronic Devices' : item.Category },
    { key: 'InspectionRequest', label: 'Inspection Request', render: (item) => {
      if (item.InspectionRequest === 'A') return 'Full inspection';
      return item.InspectionRequest;
    }},
    {
      key: 'Condition',
      label: 'Condition',
      render: (item) => {
        if (!item.Condition) return '';
        if (item.Condition === 'N') return 'Back to New';
        if (item.Condition === 'W') return 'Brand New';
        return `Grade ${item.Condition}`;
      }
    },
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
  ];

  const handleSearch = (searchParams = {}) => {
    const hasAnyFilters = Object.entries(searchParams).some(([key, value]) => {
      if (Array.isArray(value)) return value.length > 0;
      return value?.trim?.();
    });
  
    const finalParams = hasAnyFilters ? searchParams : {};
  
    fetch(`http://${window.location.hostname}:8088/non_laptop/api/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(finalParams),
    })
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          set_nonLaptops(data);
        } else {
          console.error('Unexpected data format:', data);
          set_nonLaptops([]);
        }
      })
      .catch((err) => {
        console.error('Fetch error:', err);
        set_nonLaptops([]);
      });
  };

  const handleAction = (database_IDs) => {
    console.log(database_IDs)
        fetch(`http://${window.location.hostname}:8088/non_laptop/api/updaterequest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: database_IDs }),
    })
      .then((res) => res.json())
      .then((data) => {
        handleSearch({})
      })
      .catch((err) => {
        console.error('Fetch error:', err);
      });
  }
  
  
  useEffect(() => {
    handleSearch({});
  }, []);
  

  return (
    <GenericList
      items={nonLaptops}
      columns={columns}
      searchFields={searchFields}
      filterFields={filterFields}
      basePath="/non-pc"
      itemKey="ID"
      onSearch={handleSearch}
      action={true}
      onAction={handleAction}
    />
  );
}

export default NonPCList;