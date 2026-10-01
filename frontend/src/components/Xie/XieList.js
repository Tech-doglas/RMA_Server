import { readList } from '../common/requestResult';
import { apiFetch } from '../common/access';
import React, { useEffect, useState, useCallback, useRef } from "react";
import GroupedGenericList from "../common/GroupedGenericList";

function XieList({department}) {
  const [xieItems, setXieItems] = useState([]);
  const [snowbellDept, setSnowbellDept] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const searchVersion = useRef(0);
  const lastSearch = useRef({});

  const columns = [
    { key: "tracking_number", label: "Tracking Number" },
    { key: "order_number", label: "Order Number" },
    { key: "laptop_name", label: "Laptop Name" },
    { key: "customer_name", label: "Customer Name" },
    { key: "serial_number", label: "Serial Number" },
    { key: "return_id", label: "Return ID" },
    { key: "condition", label: "Condition" },
    { key: "location", label: "Location" },
    { key: "tracking_received_date", label: "Tracking Received Date" },
    { key: "inspection_date", label: "Inspection Date" },
    { key: "delivery_date", label: "Delivery Date" },
    { key: "return_type", label: "Return Type" },
  ];

  const searchFields = [
    {
      name: "order_number",
      key: "order_number",
      label: "Order Number",
      type: "text",
      placeholder: "Search order number",
    },
    {
      name: "tracking_number",
      key: "tracking_number",
      label: "Tracking #",
      type: "text",
      placeholder: "Search tracking #",
    },
    {
      name: "serial_number",
      key: "serial_number",
      label: "Serial #",
      type: "text",
      placeholder: "Search serial #",
    },
    {
      name: "return_id",
      key: "return_id",
      label: "Return ID",
      type: "text",
      placeholder: "Search return ID",
    },
  ];

  const filterFields = [
    {
      name: "return_type",
      key: "return_type",
      label: "Return Type",
      type: "multiselect",
      options: [
        { value: "BULK_NEW", label: "BULK_NEW" },
        { value: "REGULAR", label: "REGULAR" },
      ],
    },
  ];

  const handleSearch = useCallback(async (searchParams = {}) => {
    const version = ++searchVersion.current;
    lastSearch.current = searchParams;
    setLoading(true);
    setError('');
    try {
      const response = await apiFetch(`http://${window.location.hostname}:8088/xie/api/search`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(searchParams),
      });
      const data = await readList(response);
      if (version === searchVersion.current) setXieItems(data);
    } catch (failure) {
      if (version === searchVersion.current) setError(failure.message || 'Unable to load items. Please try again.');
    } finally {
      if (version === searchVersion.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    handleSearch({});
    return () => { searchVersion.current += 1; };
  }, [handleSearch]);

  useEffect(() => {
    if (department === "SnowBell") {
      setSnowbellDept(true);
    }
  }, [department]);

  return (
    <GroupedGenericList
      items={xieItems}
      columns={columns}
      searchFields={searchFields}
      filterFields={filterFields}
      basePath="/xie-list"
      itemKey="id"
      onSearch={handleSearch}
      loading={loading}
      error={error}
      xie={snowbellDept}
    />
  );
}

export default XieList;
