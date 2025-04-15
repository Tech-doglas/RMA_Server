import React from 'react';
import { useParams, Link } from 'react-router-dom';
import DetailView from './common/DetailView';
import nonLaptops from '../data/nonLaptops';

function NonPCDetails() {
  const { id } = useParams();
  const nonLaptop = nonLaptops.find((nl) => nl.ID === parseInt(id));

  const fields = [
    { key: 'ReceivedDate', label: 'Received Date' },
    { key: 'TrackingNumber', label: 'Tracking#' },
    { key: 'Category', label: 'Category', render: (item) => item.Category === 'Electronic' ? 'Electronic Devices' : item.Category },
    { key: 'Name', label: 'Name' },
    { key: 'OdooRef', label: 'Odoo Code' },
    { key: 'InspectionRequest', label: 'Inspection Request', render: (item) => {
      if (item.InspectionRequest === 'A') return 'Full inspection';
      if (item.InspectionRequest === 'B') return 'Quick Check';
      if (item.InspectionRequest === 'C') return 'As it';
      return item.InspectionRequest;
    }, className: (item) => {
      if (item.InspectionRequest === 'A') return 'text-red-500';
      if (item.InspectionRequest === 'B') return 'text-yellow-500';
      if (item.InspectionRequest === 'C') return 'text-green-500';
      return '';
    }},
    { key: 'Condition', label: 'Condition', render: (item) => item.Condition === 'N' ? 'Back to New' : `Grade ${item.Condition}` },
    { key: 'Location', label: 'Location' },
    { key: 'LastModifiedDateTime', label: 'Last Edited DateTime' },
    { key: 'LastModifiedUser', label: 'Last Edited User' },
  ];

  const actions = [
    {
      label: 'Edit',
      onClick: () => {},
      className: 'bg-orange-500 hover:bg-orange-600',
      render: () => <Link to={`/non-pc/${id}/edit`} className="inline-block bg-orange-500 text-white px-4 py-2 rounded hover:bg-orange-600">Edit</Link>,
    },
  ];

  return (
    <DetailView
      item={nonLaptop}
      fields={fields}
      basePath="/non-pc"
      itemId={id}
      actions={actions}
    />
  );
}

export default NonPCDetails;