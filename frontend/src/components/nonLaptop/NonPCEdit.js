import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import GenericForm from "../common/GenericForm";
import { ClipLoader } from "react-spinners";

function NonPCEdit() {
  const { id } = useParams();
  const [nonLaptop, setNonLaptop] = useState(null);
  const [images, setImages] = useState({});

  const [userOptions, setUserOptions] = useState([]);

  const initialData = {
    trackingNumber: nonLaptop?.TrackingNumber || "",
    receivedDate: nonLaptop?.ReceivedDate || "",
    category: nonLaptop?.Category || "",
    name: nonLaptop?.Name || "",
    odooRef: nonLaptop?.OdooRef || "",
    condition: nonLaptop?.Condition || "",
    location: nonLaptop?.Location || "",
    remark: nonLaptop?.Remark || "",
    newImages: [],
  };

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
        { value: "A", label: "Grade A" },
        { value: "B", label: "Grade B" },
        { value: "C", label: "Grade C" },
        { value: "F", label: "Grade F" },
      ],
    },
    {
      name: "location",
      label: "Location",
      type: "text",
      placeholder: "e.g., On Pallet/A1",
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
        value.length === 0 &&
        nonLaptop?.images.length === 0
          ? "Grades B, C, and F require at least one photo"
          : null,
    },
    {
      name: "user",
      label: "User",
      type: "select",
      options: userOptions,
      required: true,
    },
  ];

  const handleSubmit = (formData) => {
    const body = new FormData();
    for (const [key, value] of Object.entries(formData)) {
      if (Array.isArray(value)) {
        value.forEach((file) => body.append(key, file));
      } else {
        body.append(key, value);
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

  useEffect(() => {
    fetch(`http://${window.location.hostname}:8088/non_laptop/item/api/${id}`)
      .then((res) => res.json())
      .then((data) => setNonLaptop(data))
      .catch((err) => console.error("Error fetching laptop:", err));

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
    />
  );
}

export default NonPCEdit;
