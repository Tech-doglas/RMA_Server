import React, {useState, useEffect} from 'react';
import { useParams } from 'react-router-dom';
import GenericForm from '../common/GenericForm';
import { ClipLoader } from 'react-spinners';

function LaptopEdit() {
  const { id } = useParams();
  const [laptop, setLaptop] = useState(null);
  const [images, setImages] = useState({});

  const [userOptions, setUserOptions] = useState([]);

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
      label: 'Stock (SOLD)',
      type: 'checkbox',
    },
    {
      name: 'orderNumber',
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
    {
      name: 'user',
      label: 'User',
      type: 'select',
      options: userOptions,
      required: true,
    },
  ];

    useEffect(() => {
      fetch(`http://${window.location.hostname}:8088/auth/api/users`)
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data)) {
            setUserOptions([
              { value: '', label: 'Select User', disabled: true },
              ...data.map((user) => ({ value: user, label: user })),
            ]);
          }
        })
        .catch((err) => console.error('Error fetching users:', err));
    }, []);

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

    if (!laptop) {
      return (
        <div className="p-6 flex justify-center items-center">
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
      payload.append('updatedSpec', formData.updatedSpec);
      payload.append('serial_number', formData.serialNumber);
      payload.append('condition', formData.condition);
      payload.append('sealed', formData.sealed ? '1' : '');
      payload.append('odoorecord', formData.odooRecord ? '1' : '');
      payload.append('odooRef', formData.odooRef);
      payload.append('sku', formData.sku);
      payload.append('stock', formData.stock ? '' : 'SOLD');
      payload.append('order_number', formData.orderNumber);
      payload.append('remark', formData.remark);
      payload.append('user', formData.user);
    
      // Append new images
      if (formData.newImages?.length > 0) {
        Array.from(formData.newImages).forEach((file) => {
          payload.append('new_images', file);
        });
      }
    
      fetch(`http://${window.location.hostname}:8088/laptop/item/update/${id}`, {
        method: 'POST',
        body: payload,
      })
        .then((res) => {
          if (res.ok) {
            return res.text().then((text) => {
              console.log('Update successful:', text);
              window.location.href = `/pc/${id}`; // Redirect to details page
            });
          } else {
            return res.text().then((text) => {
              throw new Error(text);
            });
          }
        })
        .catch((err) => {
          console.error('Edit failed:', err);
          alert('Update failed: ' + err.message);
        });
    };

    const handleDelete = () => {
      fetch(`http://${window.location.hostname}:8088/laptop/item/api/item/${id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      })
        .then((res) => {
          if (!res.ok) throw new Error('Failed to delete');
          window.location.href = '/pc';
        })
        .catch((err) => {
          console.error('Delete failed:', err);
          alert('Delete failed: ' + err.message);
        });
    };
    
    
  return (
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
  );
}

export default LaptopEdit;