import React, { useState, useEffect } from 'react';
import GenericList from '../common/GenericList';

function LaptopList() {
  const [laptops, setLaptops] = useState([]);

  const columns = [
    { key: 'Brand', label: 'Brand' },
    { key: 'Condition', label: 'Condition', render: (item) => item.Condition === 'N' ? 'Back to New' : `Grade ${item.Condition}` },
    { key: 'Model', label: 'Model' },
    { key: 'Spec', label: 'Spec', render: (item) => item.UpDatedSpec ? (<><s>{item.Spec}</s> → {item.UpDatedSpec}</>) : item.Spec },
    { key: 'SerialNumber', label: 'Serial Number' },
    { key: 'OdooRef', label: 'Odoo Code' },
    { key: 'SKU', label: 'SKU' },
    { key: 'OrderNumber', label: 'Order Number' },
    { key: 'Stock', label: 'Stock', defaultVisible: false },
    { key: 'Sealed', label: 'Sealed', render: (item) => item.Sealed ? '✅' : '❌', defaultVisible: false },
    { key: 'OdooRecord', label: 'Odoo Record', render: (item) => item.OdooRecord ? '✅' : '❌', defaultVisible: false },
  ];

  const searchFields = [
    { name: 'serialNumber', label: 'Serial Number', key: 'SerialNumber', type: 'text', placeholder: 'Enter serial number' },
    { name: 'model', label: 'Model', key: 'Model', type: 'text', placeholder: 'Enter model' },
  ];

  const filterFields = [
    {
      name: 'brand',
      label: 'Brand',
      key: 'Brand',
      type: 'select',
      options: [
        { value: '', label: 'All Brands' },
        { value: 'HP', label: 'HP' },
        { value: 'Dell', label: 'Dell' },
        { value: 'Lenovo', label: 'Lenovo' },
        { value: 'Apple', label: 'Apple' },
        { value: 'Acer', label: 'Acer' },
        { value: 'ASUS', label: 'ASUS' },
        { value: 'MSI', label: 'MSI' },
        { value: 'IBuyPower', label: 'IBuyPower' },
      ],
    },
    {
      name: 'conditions',
      label: 'Condition',
      key: 'Condition',
      type: 'multiselect',
      options: [
        { value: 'N', label: 'Back to New' },
        { value: 'A', label: 'Grade A' },
        { value: 'B', label: 'Grade B' },
        { value: 'C', label: 'Grade C' },
        { value: 'F', label: 'Grade F' },
      ],
    },
    {
      name: 'stock',
      label: 'Stock',
      key: 'Stock',
      type: 'checkbox',
      options: [
        { value: 'In Stock', label: 'In Stock' },
        { value: 'SOLD', label: 'SOLD' },
      ],
      getValue: (item) => item.Stock || 'In Stock',
    },
    {
      name: 'techDone',
      label: 'Tech Done',
      key: 'TechDone',
      type: 'checkbox',
      options: [
        { value: 'Done', label: 'Done' },
        { value: 'Not yet', label: 'Not yet' },
      ],
      getValue: (item) => item.TechDone ? 'Done' : 'Not yet',
    },
  ];

  const handleSearch = (searchParams) => {
    // Check if the user entered any filters
    const hasAnyFilters = Object.entries(searchParams).some(([key, value]) => {
      if (Array.isArray(value)) return value.length > 0;
      return value?.trim?.();
    });
  
    // If no filters, default to only TechDone = 'Not yet'
    const finalParams = hasAnyFilters ? searchParams : { techDone: ['Not yet'] };
  
    fetch('http://127.0.0.1:8088/laptop/api/laptops/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(finalParams),
    })
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setLaptops(data);
        } else {
          console.error('Unexpected data format:', data);
          setLaptops([]);
        }
      })
      .catch((err) => {
        console.error('Fetch error:', err);
        setLaptops([]);
      })
  };
  
  
  useEffect(() => {
    handleSearch({ techDone: ['Not yet'] });
  }, []);

  return (
    <GenericList
      items={laptops}
      columns={columns}
      searchFields={searchFields}
      filterFields={filterFields}
      basePath="/pc"
      itemKey="ID"
      onSearch={handleSearch}
    />
  );
}

export default LaptopList;