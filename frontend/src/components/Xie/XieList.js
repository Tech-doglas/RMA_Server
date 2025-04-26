import React, { useEffect, useState } from 'react';
import GenericList from '../common/GenericList';

function XieList() {
  const [xieItems, setXieItems] = useState([]);

  const columns = [
    { key: 'order_number', label: 'Order Number' },
    { key: 'tracking_number', label: 'Tracking Number' },
    { key: 'qty', label: 'Quantity' },
    { key: 'laptop_name', label: 'Laptop Name' },
    { key: 'customer_name', label: 'Customer Name' },
    { key: 'serial_number', label: 'Serial Number' },
    { key: 'return_id', label: 'Return ID' },
    { key: 'grading', label: 'Condition' },
    { key: 'tracking_received_date', label: 'Tracking Received Date' },
    { key: 'inspection_date', label: 'Inspection Date' },
    { key: 'delivery_date', label: 'Delivery Date' },
    { key: 'return_type', label: 'Return Type' },
  ];

  const searchFields = [
    { name: 'order_number', key: 'order_number', label: 'Order Number', type: 'text', placeholder: 'Search order number' },
    { name: 'tracking_number', key: 'tracking_number', label: 'Tracking #', type: 'text', placeholder: 'Search tracking #' },
    { name: 'serial_number', key: 'serial_number', label: 'Serial #', type: 'text', placeholder: 'Search serial #' },
    { name: 'return_id', key: 'return_id', label: 'Return ID', type: 'text', placeholder: 'Search return ID' },
  ];  

  const filterFields = [
    {
      name: 'return_type',
      key: 'return_type',
      label: 'Return Type',
      type: 'multiselect',
      options: [
        { value: 'New Bulk', label: 'New Bulk' },
        { value: 'Old Bulk', label: 'Old Bulk' },
        { value: 'Buyer', label: 'Buyer' },
      ],
    },
  ];

  const handleSearch = (searchParams) => {
    const hasAnyFilters = Object.entries(searchParams).some(([key, value]) => {
      if (Array.isArray(value)) return value.length > 0;
      return value?.trim?.();
    });
  
    const finalParams = hasAnyFilters ? searchParams : {};
  
    fetch(`http://${window.location.hostname}:8088/xie/api/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(finalParams),
    })
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setXieItems(data);
        } else {
          console.error('Unexpected data format:', data);
          setXieItems([]);
        }
      })
      .catch((err) => {
        console.error('Fetch error:', err);
        setXieItems([]);
      });
  };
  
  useEffect(() => {
    handleSearch({});
  }, []);
  

  return (
    <GenericList
      items={xieItems}
      columns={columns}
      searchFields={searchFields}
      filterFields={filterFields}
      basePath="/xie-list"
      itemKey="id"
      onSearch={handleSearch}
    />
  );
}

export default XieList;
