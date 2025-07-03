import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate  } from 'react-router-dom';
import DetailView from '../common/DetailView';
import Toast from '../common/Toast';
import { gradeMapping } from '../common/GradeMapping';

function LaptopDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [laptop, setLaptop] = useState(null);
  const [images, setImages] = useState([]);
  const [toast, setToast] = useState(null);

  const fields = [
    { key: 'Brand', label: 'Brand' },
    { key: 'Model', label: 'Model' },
    { key: 'Spec', label: 'Specification', render: (item) => item.UpDatedSpec ? (<><s>{item.Spec}</s> → {item.UpDatedSpec}</>) : item.Spec },
    { key: 'SerialNumber', label: 'Serial Number' },
    { key: 'OdooRef', label: 'Odoo Code' },
    { key: 'Condition', label: 'Condition', render: (item) => item.Condition ? gradeMapping(item.Condition) : ''},
    { key: 'Stock', label: 'Stock', className: (item) => item.Stock === 'SOLD' ? 'text-red-500' : '' },
    { key: 'SKU', label: 'SKU' },
    { key: 'OrderNumber', label: 'Order Number' },
    { key: 'Sealed', label: 'Sealed', render: (item) => item.Sealed ? '✅' : '❌' },
    { key: 'OdooRecord', label: 'Odoo Record', render: (item) => item.OdooRecord ? '✅' : '❌' },
    { key: 'TechDone', label: 'Tech Done', render: (item) => item.TechDone ? '✅' : '❌' },
    { key: 'Remark', label: 'Remark' },
    { key: 'LastModifiedUser', label: 'Last Edited User' },
    { key: 'LastModifiedDateTime', label: 'Last Edited DateTime' },
  ];

  useEffect(() => {
    fetch(`http://${window.location.hostname}:8088/laptop/item/${id}`)
      .then((res) => res.json())
      .then((data) => setLaptop(data))
      .catch((err) => console.error('Error fetching laptop:', err));

    fetch(`http://${window.location.hostname}:8088/images/api/laptop/${id}`)
      .then((res) => res.json())
      .then((data) => setImages({ list: data, type: 'laptop' }))
      .catch((err) => console.error('Error fetching images:', err));
  }, [id]);

  const actions = [
    {
      label: 'Sales',
      className: laptop?.Stock === 'SOLD' ? 'bg-gray-400 cursor-not-allowed' : 'bg-sky-500 hover:bg-sky-600',
      disabled: laptop?.Stock === 'SOLD',
      render: () => (
        <Link
          to={laptop?.Stock === 'SOLD' ? '#' : `/pc/${id}/sales`}
          className={`inline-block px-4 py-2 rounded text-white ${
            laptop?.Stock === 'SOLD' ? 'bg-gray-400 cursor-not-allowed' : 'bg-sky-500 hover:bg-sky-600'
          }`}
          onClick={(e) => {
            if (laptop?.Stock === 'SOLD') {
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
      render: () => <Link to={`/pc/${id}/edit`} className="inline-block bg-orange-500 text-white px-4 py-2 rounded hover:bg-orange-600">Edit</Link>,
    },
    {
      label: 'Done',
      onClick: () => {
        fetch(`http://${window.location.hostname}:8088/laptop/item/tech_done/${id}`, {
          method: 'POST',
        })
          .then((res) => res.json())
          .then((data) => {
            if (data.status === 'success') {
              setToast({ message: 'Marked as Tech Done ✔️', type: 'success' });
              setTimeout(() => navigate('/pc'), 500);
            } else {
              setToast({ message: data.error || 'Failed to update', type: 'error' });
            }
          })
          .catch(() =>
            setToast({ message: 'Server error. Try again later.', type: 'error' })
          );
      },
      className:
        laptop?.Stock !== 'SOLD' || laptop?.TechDone
          ? 'bg-gray-400 cursor-not-allowed'
          : 'bg-green-500 hover:bg-green-600',
      disabled: laptop?.Stock !== 'SOLD' || laptop?.TechDone,
    }
  ];

  return (
    <>
    {toast && <Toast {...toast} onClose={() => setToast(null)} />}
    <DetailView
      item={laptop}
      fields={fields}
      basePath="/pc"
      itemId={id}
      actions={actions}
      images={images}
    />
    </>
  );
}

export default LaptopDetails;