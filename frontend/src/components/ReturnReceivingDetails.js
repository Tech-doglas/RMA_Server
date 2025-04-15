import React from 'react';
import { useParams } from 'react-router-dom';
import DetailView from './common/DetailView';
import returnReceivingRecords from '../data/returnReceiving';

function ReturnReceivingDetails() {
  const { id } = useParams();
  const record = returnReceivingRecords.find((r) => r.TrackingNumber === id);

  const fields = [
    { key: 'TrackingNumber', label: 'Tracking #' },
    { key: 'Company', label: 'Company' },
    { key: 'CreationDateTime', label: 'Record DateTime' },
    { key: 'Remark', label: 'Remark' },
    { key: 'Recorded', label: 'Recorded', render: (item) => item.Recorded ? '✅' : '❌' },
  ];

  const actions = [
    {
      label: record?.Recorded ? 'Recorded' : 'Record',
      onClick: () => console.log('Marked as Recorded:', record?.TrackingNumber),
      className: record?.Recorded ? 'bg-gray-400 cursor-not-allowed' : 'bg-sky-500 hover:bg-sky-600',
      disabled: record?.Recorded,
    },
  ];

  return (
    <DetailView
      item={record}
      fields={fields}
      basePath="/return-receiving"
      itemId={id}
      actions={actions}
    />
  );
}

export default ReturnReceivingDetails;