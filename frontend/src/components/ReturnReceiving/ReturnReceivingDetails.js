import React, {useState, useEffect} from 'react';
import { useParams } from 'react-router-dom';
import DetailView from '../common/DetailView';
import { ClipLoader } from 'react-spinners';

function ReturnReceivingDetails() {
  const { id } = useParams();
  const [records, setRecords] = useState([]);
  const [image, setImage] = useState([]);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
    fetch(`http://localhost:5000/return/api/return/${id}`)
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
    fetch(`http://localhost:5000/images/api/images/${id}`)
      .then((res) => res.json())
      .then((data) => setImage(data))
      .catch((err) => console.error('Error fetching images:', err));
  }, [id]);

  if (loading) return (
          <div className="p-6 flex justify-center items-center">
            <ClipLoader color="#4B5563" size={40} />
          </div>
        );

  return (
    <DetailView
      item={records}
      fields={fields}
      basePath="/return"
      itemId={id}
      actions={actions}
      images={image}
    />
  );
}

export default ReturnReceivingDetails;