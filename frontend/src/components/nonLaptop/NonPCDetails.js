import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import DetailView from '../common/DetailView';
import { ClipLoader } from 'react-spinners';
import { gradeMapping } from '../common/GradeMapping';
import Toast from '../common/Toast';


function NonPCDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [images, setImages] = useState([]);
  const [nonLaptop, setNonLaptop] = useState(null);
  const [toast, setToast] = useState(null);

  const fields = [
    { key: 'ReceivedDate', label: 'Received Date' },
    { key: 'TrackingNumber', label: 'Tracking#' },
    { key: 'Category', label: 'Category', render: (item) => item.Category === 'Electronic' ? 'Electronic Devices' : item.Category },
    { key: 'Name', label: 'Name' },
    { key: 'OdooRef', label: 'Odoo Code' },
    {
      key: 'InspectionRequest', label: 'Inspection Request', render: (item) => {
        if (item.InspectionRequest === 'A') return 'Full inspection';
        if (item.InspectionRequest === 'B') return 'Quick Check';
        if (item.InspectionRequest === 'C') return 'As it';
        return item.InspectionRequest;
      }, className: (item) => {
        if (item.InspectionRequest === 'A') return 'text-red-500';
        if (item.InspectionRequest === 'B') return 'text-yellow-500';
        if (item.InspectionRequest === 'C') return 'text-green-500';
        return '';
      }
    },
    {
      key: 'Condition',
      label: 'Condition',
      render: (item) => {
        if (!item.Condition) return '';
        return gradeMapping(item.Condition);
      }
    },
    { key: 'SKU', label: 'SKU' },
    { key: 'OrderNumber', label: 'Order Number' },
    { key: 'Location', label: 'Location' },
    { key: 'OdooRecord', label: 'Odoo Record', render: (item) => item.OdooRecord ? '✅' : '❌' },
    { key: 'ReadyToSale', label: 'Ready To Sale', render: (item) => item.ReadyToSale ? '✅' : '❌' },
    { key: 'OrderDistributed', label: 'Order Distributed', render: (item) => item.OrderDistributed ? '✅' : '❌' },
    { key: 'Remark', label: 'Remark' },
    { key: 'LastModifiedDateTime', label: 'Last Edited DateTime' },
    { key: 'LastModifiedUser', label: 'Last Edited User' },
  ];

  const actions = [
    {
      label: 'Sales',
      className: nonLaptop?.SaleDate ? 'bg-gray-400 cursor-not-allowed' : 'bg-sky-500 hover:bg-sky-600',
      disabled: !nonLaptop?.SaleDate,
      render: () => (
        <Link
          to={nonLaptop?.SaleDate ? '#' : `/non-pc/${id}/sales`}
          className={`inline-block px-4 py-2 rounded text-white ${nonLaptop?.SaleDate ? 'bg-gray-400 cursor-not-allowed' : 'bg-sky-500 hover:bg-sky-600'
            }`}
          onClick={(e) => {
            if (nonLaptop?.SaleDate) {
              e.preventDefault();
            }
          }}
        >
          Sales
        </Link>
      ),
    },
    {
      label: 'Edit',
      className: 'bg-orange-500 hover:bg-orange-600',
      render: () => <Link to={`/non-pc/${id}/edit`} className="inline-block bg-orange-500 text-white px-4 py-2 rounded hover:bg-orange-600">Edit</Link>,
    },
    {
      label: 'Distributed',
      onClick: () => {
        fetch(`http://${window.location.hostname}:8088/non_laptop/item/api/distributed/${id}`, {
          method: 'POST',
        })
          .then((res) => res.json())
          .then((data) => {
            if (data.status === 'success') {
              setToast({ message: 'Marked as Order Distributed ✔️', type: 'success' });
              setTimeout(() => navigate(`/non-pc`), 500);
            } else {
              setToast({ message: data.error || 'Failed to update', type: 'error' });
            }
          })
          .catch(() =>
            setToast({ message: 'Server error. Try again later.', type: 'error' })
          );
      },
      className:
        !nonLaptop?.OrderNumber || nonLaptop?.OrderDistributed
          ? 'bg-gray-400 cursor-not-allowed'
          : 'bg-green-500 hover:bg-green-600',
      disabled: !nonLaptop?.OrderNumber || nonLaptop?.OrderDistributed,
    }
  ];

  useEffect(() => {
    fetch(`http://${window.location.hostname}:8088/non_laptop/item/api/${id}`)
      .then(res => res.json())
      .then(data => setNonLaptop(data));
  }, [id]);

  useEffect(() => {
    if (!nonLaptop) return;
    fetch(`http://${window.location.hostname}:8088/images/api/non_laptop/${nonLaptop.TrackingNumber}`)
      .then((res) => res.json())
      .then((data) => setImages({ list: data, type: 'non_laptop' }))
      .catch((err) => console.error('Error fetching images:', err));
  }, [nonLaptop]);

  if (!nonLaptop) {
    return (
      <div className="p-6 flex justify-center items-center">
        <ClipLoader color="#4B5563" size={40} />
      </div>
    );
  }


  return (
    <>
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
      <DetailView
        item={nonLaptop}
        fields={fields}
        basePath="/non-pc"
        itemId={nonLaptop.TrackingNumber}
        actions={actions}
        images={images}
      />
    </>

  );
}

export default NonPCDetails;