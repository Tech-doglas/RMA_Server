import React from 'react';
import GenericList from './common/GenericList';
import returnReceivingRecords from '../data/returnReceiving';

function ReturnReceivingList() {
  const columns = [
    { key: 'TrackingNumber', label: 'Tracking #' },
    { key: 'Company', label: 'Company' },
    { key: 'CreationDateTime', label: 'Record DateTime' },
    { key: 'Recorded', label: 'Recorded', render: (item) => item.Recorded ? '✅' : '❌' },
  ];

  const searchFields = [
    { name: 'trackingNumber', label: 'Tracking #', key: 'TrackingNumber', type: 'text', placeholder: 'e.g., 1ZV390E3000000000' },
    { name: 'recordDate', label: 'Record Date', key: 'CreationDateTime', type: 'date' },
  ];

  const filterFields = [
    {
      name: 'company',
      label: 'Company',
      key: 'Company',
      type: 'select',
      options: [
        { value: '', label: 'All Companies' },
        { value: 'PX/LEO/KRIZY', label: 'PX/LEO/KRIZY' },
        { value: 'SNOWBELL/XIE/PITY TECH', label: 'SNOWBELL/XIE/PITY TECH' },
        { value: 'Others', label: 'Others' },
      ],
    },
    {
      name: 'recorded',
      label: 'Recorded',
      key: 'Recorded',
      type: 'checkbox',
      options: [
        { value: 'recorded', label: 'Recorded' },
        { value: 'not_recorded', label: 'Not Recorded' },
      ],
      getValue: (item) => item.Recorded ? 'recorded' : 'not_recorded',
    },
  ];

  return (
    <GenericList
      items={returnReceivingRecords}
      columns={columns}
      searchFields={searchFields}
      filterFields={filterFields}
      basePath="/return-receiving"
      itemKey="TrackingNumber"
    />
  );
}

export default ReturnReceivingList;