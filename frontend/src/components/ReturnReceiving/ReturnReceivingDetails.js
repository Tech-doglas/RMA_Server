import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import DetailView from '../common/DetailView';
import { ClipLoader } from 'react-spinners';
import Toast from '../common/Toast';

function ReturnReceivingDetails() {
  const { id } = useParams();
  const [records, setRecords] = useState([]);
  const [image, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const navigate = useNavigate();

  const fields = [
    { key: 'TrackingNumber', label: 'Tracking #' },
    { key: 'Company', label: 'Company' },
    { key: 'Code', label: 'Code' },
    { key: 'CreationDateTime', label: 'Record DateTime' },
    { key: 'OrderNumber', label: 'Order #' },
    { key: 'Remark', label: 'Remark' },
    { key: 'Recorded', label: 'Recorded', render: (item) => item.Recorded ? '✅' : '❌' },
  ];

  const actions = [
    {
      label: 'Edit',
      className: 'bg-orange-500 hover:bg-orange-600',
      onClick: async () => {
        try {
          navigate(`/return/edit/${records?.TrackingNumber}`)
        } catch (err) {
          setToast({ message: 'Server error. Try again later.', type: 'error' })
        }
      },
      hidden: records?.Company?.includes('SNOWBELL')
    },
    {
      label: records?.Recorded ? 'Recorded' : 'Record',
      onClick: async () => {
        try {
          await fetch(`http://${window.location.hostname}:8088/return/recorded/${records?.TrackingNumber}`);
          setToast({ message: 'Marked as Recorded ✔️', type: 'success' });
          window.location.reload();
        } catch (err) {
          setToast({ message: 'Server error. Try again later.', type: 'error' })
        }
      },
      className: records?.Recorded ? 'bg-gray-400 cursor-not-allowed' : 'bg-sky-500 hover:bg-sky-600',
      disabled: records?.Recorded,
    },
    {
      label: 'Input',
      onClick: async () => {
        try {
          navigate(`/xie/input`, {
            state: {
              trackingNumber: records?.TrackingNumber,
              returnType: records?.Code,
              trackingReceivedDate: new Date(records?.CreationDateTime).toISOString().split('T')[0],
            }
          })
        } catch (err) {
          setToast({ message: 'Server error. Try again later.', type: 'error' })
        }
      },
      className: 'bg-green-500 hover:bg-green-600',
      hidden: !records?.Company?.includes('SNOWBELL')
    },
    {
      label: 'Input PC',
      onClick: async () => {
        try {
          window.open(`${window.location.origin}/pc/input`, '_blank');
        } catch (err) {
          setToast({ message: 'Server error. Try again later.', type: 'error' })
        }
      },
      className: 'bg-green-500 hover:bg-green-600',
      hidden: records?.Company?.includes('SNOWBELL')
    },
    {
      label: 'Input Non-PC',
      onClick: async () => {
        try {
          window.open(`${window.location.origin}/non-pc/input`, '_blank');
        } catch (err) {
          setToast({ message: 'Server error. Try again later.', type: 'error' })
        }
      },
      className: 'bg-green-500 hover:bg-green-600',
      hidden: records?.Company?.includes('SNOWBELL')
    },
    {
      label: records?.Code === "REGULAR" ? 'Mark As BULK_NEW' : 'Mark As REGULAR',
      onClick: async () => {
        try {
          const newCode = records?.Code === "REGULAR" ? 'BULK_NEW' : 'REGULAR';
          await fetch(`http://${window.location.hostname}:8088/return/updateCode/${records?.TrackingNumber}/${newCode}`);
          setToast({ message: `Marked as ${newCode} ✔️`, type: 'success' });
          window.location.reload();
        } catch (err) {
          setToast({ message: 'Server error. Try again later.', type: 'error' })
        }
      },
      className: 'bg-orange-500 hover:bg-orange-600',
      hidden: records.Company !== 'SNOWBELL/XIE/PITY TECH'
    },
  ];

  useEffect(() => {
    fetch(`http://${window.location.hostname}:8088/return/api/return/${id}`)
      .then(res => res.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        setRecords(data);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
    fetch(`http://${window.location.hostname}:8088/images/api/return_receiving/${id}`)
      .then((res) => res.json())
      .then((data) => setImages({ list: data, type: 'return_receiving' }))
      .catch((err) => console.error('Error fetching images:', err));
  }, [id]);

  if (loading) return (
    <div className="p-6 flex justify-center items-center">
      <ClipLoader color="#4B5563" size={40} />
    </div>
  );

  return (
    <>
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
      <DetailView
        item={records}
        fields={fields}
        basePath="/return"
        itemId={id}
        actions={actions}
        images={image}
      />
    </>
  );
}

export default ReturnReceivingDetails;