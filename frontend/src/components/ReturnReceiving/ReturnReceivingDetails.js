import React, {useState, useEffect} from 'react';
import { useParams } from 'react-router-dom';
import DetailView from '../common/DetailView';
import { ClipLoader } from 'react-spinners';
import Toast from '../common/Toast';

function ReturnReceivingDetails() {
  const { id } = useParams();
  const [records, setRecords] = useState([]);
  const [image, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

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
          await fetch(`http://${process.env.REACT_APP_API_BASE}/return/recorded/${records?.TrackingNumber}`);
          setToast({ message: 'Marked as Tech Done ✔️', type: 'success' });
          window.location.reload();
        } catch (err) {
          setToast({ message: 'Server error. Try again later.', type: 'error' })
        }
      },
      className: records?.Recorded ? 'bg-gray-400 cursor-not-allowed' : 'bg-sky-500 hover:bg-sky-600',
      disabled: records?.Recorded,
    },
  ];

  useEffect(() => {
    fetch(`http://${process.env.REACT_APP_API_BASE}/return/api/return/${id}`)
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
    fetch(`http://${process.env.REACT_APP_API_BASE}/images/api/return_receiving/${id}`)
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