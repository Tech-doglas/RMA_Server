import React, {useState} from 'react';
import { useParams } from 'react-router-dom';
import DetailView from '../common/DetailView';

function ReturnReceivingDetails() {
  const { id } = useParams();
  const [records, setRecords] = useState([]);

  const fields = [
    { key: 'TrackingNumber', label: 'Tracking #' },
    { key: 'Company', label: 'Company' },
    { key: 'CreationDateTime', label: 'Record DateTime' },
    { key: 'Remark', label: 'Remark' },
    { key: 'Recorded', label: 'Recorded', render: (item) => item.Recorded ? '✅' : '❌' },
  ];

  const actions = [
    {
      label: records?.Recorded ? 'Recorded' : 'Record',
      onClick: async () => {
        try {
          await fetch(`http://localhost:5000/return/recorded/${records?.TrackingNumber}`);
          alert("Marked as Recorded");
          window.location.reload();
        } catch (err) {
          console.error(err);
        }
      },
      className: records?.Recorded ? 'bg-gray-400 cursor-not-allowed' : 'bg-sky-500 hover:bg-sky-600',
      disabled: records?.Recorded,
    },
  ];

  return (
    <DetailView
      item={records}
      fields={fields}
      basePath="/return"
      itemId={id}
      actions={actions}
    />
  );
}

export default ReturnReceivingDetails;