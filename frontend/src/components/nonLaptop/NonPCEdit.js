import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import GenericForm from "../common/GenericForm";
import { ClipLoader } from "react-spinners";

function NonPCEdit() {
  const { id } = useParams();
  const [nonLaptop, setNonLaptop] = useState(null);
  const [images, setImages] = useState({});

  const [currentUser, setCurrentUser] = useState('');
  const [emptyTracking, setEmptyTracking] = useState("");

  const fields = [
    {
      name: "trackingNumber",
      label: "Tracking #",
      type: "text",
      placeholder: "e.g., RA428003440US",
      required: true,
    },
    {
      name: "receivedDate",
      label: "Received Date",
      type: "date",
      required: true,
    },
    {
      name: "category",
      label: "Category",
      type: "select",
      options: [
        { value: "", label: "Select a Category", disabled: true },
        { value: "Electronic", label: "Electronic Devices" },
        { value: "Printer", label: "Printer" },
        { value: "Monitor", label: "Monitor" },
        { value: 'Gaming Console', label: 'Gaming console' },
        { value: "Other", label: "Other" },
      ],
      required: true,
    },
    {
      name: "name",
      label: "Name",
      type: "text",
      placeholder: "e.g., Google Nest Hub",
      required: true,
    },
    {
      name: "odooRef",
      label: "Odoo Code",
      type: "text",
      placeholder: "e.g., HP100022RA",
      required: true,
    },
    {
      name: "condition",
      label: "Condition",
      type: "select",
      options: [
        { value: "N", label: "Back to New" },
        { value: "W", label: "Brand New" },
        { value: "A", label: "Grade A" },
        { value: "B", label: "Grade B" },
        { value: "C", label: "Grade C" },
        { value: "F", label: "Grade F" },
      ],
    },
    {
      name: 'sku',
      label: 'SKU',
      type: 'text',
    },
    {
      name: 'orderNumber',
      label: 'Order Number',
      type: 'text',
    },
    {
      name: "location",
      label: "Location",
      type: "text",
      placeholder: "e.g., On Pallet/A1",
    },
    {
      name: 'odooRecord',
      label: 'Odoo Record',
      type: 'checkbox',
    },
    {
      name: "remark",
      label: "Remark",
      type: "textarea",
    },
    {
      name: "newImages",
      label: "Add New Images",
      type: "file",
      multiple: true,
      accept: "image/*",
      validate: (value, formData) =>
        ["B", "C", "F"].includes(formData.condition) &&
          (!value || value.length === 0) &&
          (!images?.list || images.list.length === 0)
          ? "Grades B, C, and F require at least one photo"
          : null,
    },
  ];

  const handleSubmit = (formData) => {
    const body = new FormData();
    for (const [key, value] of Object.entries(formData)) {
      if (Array.isArray(value)) {
        value.forEach((file) => body.append(key, file));
      } else {
        switch (key) {
          case "odooRecord":
            body.append(key, value ? '1' : '0');
            break;
          default:
            body.append(key, value);
            break;
        }
      }
    }

    fetch(
      `http://${window.location.hostname}:8088/non_laptop/item/api/update/${id}`,
      {
        method: "POST",
        body,
      }
    )
      .then((res) => res.json())
      .then(console.log);
  };

  const handleDelete = () => {
    const trackingNumber = nonLaptop?.TrackingNumber;

    fetch(`http://${window.location.hostname}:8088/non_laptop/item/delete/${id}?TrackingNumber=${trackingNumber}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
    })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to delete');
        window.location.href = '/non-pc';
      })
      .catch((err) => {
        console.error('Delete failed:', err);
        alert('Delete failed: ' + err.message);
      });
  };

  const handleTracking = () => {
      fetch(`http://${window.location.hostname}:8088/non_laptop/api/get_tracking_number`)
      .then((res) => res.json())
      .then((maxNumber) => {
        const nextNumber = maxNumber + 1;
        const trackingStr = `No Tracking - ${String(nextNumber).padStart(5, '0')}`;
        setEmptyTracking(trackingStr);
      })
  }

  useEffect(() => {
    const savedAuth = localStorage.getItem('auth');
    if (savedAuth) {
      const parsed = JSON.parse(savedAuth);
      setCurrentUser(parsed.username || 'Unknown User');
    }

    fetch(`http://${window.location.hostname}:8088/non_laptop/item/api/${id}`)
      .then((res) => res.json())
      .then((data) => setNonLaptop(data))
      .catch((err) => console.error("Error fetching laptop:", err));
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

  const initialData = {
    trackingNumber: nonLaptop?.TrackingNumber || "",
    receivedDate: nonLaptop?.ReceivedDate || "",
    category: nonLaptop?.Category || "",
    name: nonLaptop?.Name || "",
    odooRef: nonLaptop?.OdooRef || "",
    condition: nonLaptop?.Condition || "",
    location: nonLaptop?.Location || "",
    sku: nonLaptop?.SKU || '',
    orderNumber: nonLaptop?.OrderNumber || '',
    odooRecord: nonLaptop?.OdooRecord || false,
    remark: nonLaptop?.Remark || "",
    user: currentUser,
    newImages: [],
  };

  return (
    <div>
      <GenericForm
        initialData={initialData}
        hideBackButton={true}
        fields={fields}
        onSubmit={handleSubmit}
        onDelete={handleDelete}
        basePath="/non-pc"
        itemId={id}
        isEdit={true}
        existingImages={images || {}}
        no_tracking={true}
        onTracking={handleTracking}
        emptyTracking={emptyTracking}
      />
      <div className="p-6">
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
  );
}

export default NonPCEdit;
