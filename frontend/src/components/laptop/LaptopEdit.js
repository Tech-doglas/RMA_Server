import RequestFailure from '../common/RequestFailure';
import { apiFetch, canPermission } from '../common/access';
import React, {useState, useEffect} from 'react';
import { useParams } from 'react-router-dom';
import GenericForm from '../common/GenericForm';
import { requireOk, readJson, readList } from '../common/requestResult';
import { ClipLoader } from 'react-spinners';
import Toast from '../common/Toast';

function LaptopEdit({handleLogout}) {
  const [toast, setToast] = useState(null);
  const { id } = useParams();
  const [laptop, setLaptop] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [images, setImages] = useState({});

  const [currentUser, setCurrentUser] = useState('');

  const initialData = {
    brand: laptop?.Brand || '',
    model: laptop?.Model || '',
    spec: laptop?.Spec || '',
    updatedSpec: laptop?.UpDatedSpec || '',
    serialNumber: laptop?.SerialNumber || '',
    condition: laptop?.Condition || '',
    sealed: laptop?.Sealed || false,
    odooRecord: laptop?.OdooRecord || false,
    odooRef: laptop?.OdooRef || '',
    sku: laptop?.SKU || '',
    stock: laptop?.Stock === 'SOLD',
    orderNumber: laptop?.OrderNumber || '',
    remark: laptop?.Remark || '',
    newImages: [],
    user: currentUser,
  };

  const fields = [
    {
      name: 'brand',
      label: 'Brand',
      type: 'select',
      options: [
        { value: 'HP', label: 'HP' },
        { value: 'Dell', label: 'Dell' },
        { value: 'Lenovo', label: 'Lenovo' },
        { value: 'Apple', label: 'Apple' },
        { value: 'Acer', label: 'Acer' },
        { value: 'ASUS', label: 'ASUS' },
        { value: 'MSI', label: 'MSI' },
        { value: 'IBuyPower', label: 'IBuyPower' },
      ],
      required: true,
    },
    {
      name: 'model',
      label: 'Model',
      type: 'text',
      required: true,
    },
    {
      name: 'spec',
      label: 'Specification',
      type: 'text',
      required: true,
    },
    {
      name: 'updatedSpec',
      disabled: !canPermission('pc.sell'),
      label: 'Updated Specification',
      type: 'text',
    },
    {
      name: 'serialNumber',
      label: 'Serial Number',
      type: 'text',
      required: true,
    },
    {
      name: 'condition',
      label: 'Condition',
      type: 'select',
      options: [
        { value: 'N', label: 'Back to New' },
        { value: 'A', label: 'Grade A' },
        { value: 'B', label: 'Grade B' },
        { value: 'C', label: 'Grade C' },
        { value: 'F', label: 'Grade F' },
        { value: 'X', label: 'No Grade' },
      ],
      required: true,
    },
    {
      name: 'sealed',
      label: 'Sealed',
      type: 'checkbox',
    },
    {
      name: 'odooRecord',
      label: 'Odoo Record',
      type: 'checkbox',
    },
    {
      name: 'odooRef',
      label: 'Odoo Code',
      type: 'text',
    },
    {
      name: 'sku',
      label: 'SKU',
      type: 'text',
    },
    {
      name: 'stock',
      disabled: !canPermission('pc.sell'),
      label: 'Stock (SOLD)',
      type: 'checkbox',
    },
    {
      name: 'orderNumber',
      disabled: !canPermission('pc.sell'),
      label: 'Order Number',
      type: 'text',
    },
    {
      name: 'remark',
      label: 'Remark',
      type: 'textarea',
    },
    {
      name: 'newImages',
      label: 'Add New Images',
      type: 'file',
      multiple: true,
      accept: 'image/*',
      validate: (value, formData) =>
        ['B', 'C', 'F'].includes(formData.condition) &&
        (!value || value.length === 0) &&
        (!images?.list || images.list.length === 0)
          ? 'Grades B, C, and F require at least one photo'
          : null,
    },
  ];

    useEffect(() => {
      const savedAuth = localStorage.getItem('auth');
      if (savedAuth) {
        const parsed = JSON.parse(savedAuth);
      if (parsed.username) {
        setCurrentUser(parsed.username);
      } else {
        setToast({ message: 'Please log in again to continue.', type: 'error' });
        handleLogout()
      }
      }
    }, [handleLogout]);

    useEffect(() => {
      apiFetch(`http://${window.location.hostname}:8088/laptop/item/${id}`)
        .then(readJson)
        .then((data) => setLaptop(data))
        .catch(err => setLoadError(err.message || 'Unable to load this record. Please try again.'));
      apiFetch(`http://${window.location.hostname}:8088/images/api/laptop/${id}`)
        .then(readList)
        .then((data) => setImages({ list: data, type: 'laptop' }))
        .catch(err => setToast({ message: err.message || 'Unable to load images. Please try again.', type: 'error' }));
    }, [id]);

    if (loadError) return <RequestFailure error={loadError} basePath="/pc" />;

  if (!laptop) {
      return (
        <div role="status" aria-label="Loading record" className="p-6 flex justify-center items-center">
          <ClipLoader color="#4B5563" size={40} />
        </div>
      );
    }

    const handleSubmit = (formData) => {
      const payload = new FormData();
    
      // Append fields
      payload.append('brand', formData.brand);
      payload.append('model', formData.model);
      payload.append('spec', formData.spec);
      payload.append('updated_spec', formData.updatedSpec);
      payload.append('serial_number', formData.serialNumber);
      payload.append('condition', formData.condition);
      payload.append('sealed', formData.sealed ? '1' : '');
      payload.append('odoorecord', formData.odooRecord ? '1' : '');
      payload.append('odooRef', formData.odooRef);
      payload.append('sku', formData.sku);
      payload.append('stock', formData.stock ? 'SOLD' : '');
      payload.append('order_number', formData.orderNumber);
      payload.append('remark', formData.remark);
      payload.append('user', formData.user);

      if (formData.user === 'Unknown User') {
        setToast({ message: 'Failed to Submit, User name is empty. Try Relogin again', type: 'error' });
        return { success: false, error: 'Please sign in again before saving.' };
      }
    
      // Append new images
      if (formData.newImages?.length > 0) {
        Array.from(formData.newImages).forEach((file) => {
          payload.append('new_images', file);
        });
      }
    
      return apiFetch(`http://${window.location.hostname}:8088/laptop/item/update/${encodeURIComponent(id)}`, {
        method: 'POST', body: payload,
      }).then(requireOk).then(() => ({ success: true, redirectTo: `/pc/${encodeURIComponent(id)}` }));
    };

    const handleDelete = () => {
      return apiFetch(`http://${window.location.hostname}:8088/laptop/item/api/item/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }).then(requireOk).then(() => ({ success: true }));
    };
    
    
  return (
    <>
    {toast && <Toast {...toast} onClose={() => setToast(null)} />}
    <div>
      <GenericForm
        initialData={initialData}
        fields={fields}
        onSubmit={handleSubmit}
        onDelete={handleDelete}
        basePath="/pc"
        itemId={id}
        isEdit={true}
        hideBackButton={true}
        existingImages={images || {}}
      />
      <div className="app-form app-card mt-4">
        <div className="flex flex-col mb-4">
          <label className="text-sm font-bold mb-1">User</label>
          <input
            type="text"
            value={currentUser}
            readOnly
            className="p-2 border rounded bg-gray-100"
          />
        </div>
      </div>
    </div>
    </>
  );
}

export default LaptopEdit;
