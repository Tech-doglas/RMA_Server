import React, { useState, useEffect } from "react";
import GenericList from "../common/GenericList";

const apiHost = window.location.hostname;
const apiBaseUrl = `${apiHost}:8088`;

function ReturnReceivingList() {
  const [records, setRecords] = useState([]);

  const columns = [
    { key: "TrackingNumber", label: "Tracking #" },
    { key: "Company", label: "Company" },
    { key: "CreationDateTime", label: "Record DateTime" },
    {
      key: "Recorded",
      label: "Recorded",
      render: (item) => (item.Recorded ? "✅" : "❌"),
    },
  ];

  const searchFields = [
    {
      name: "trackingNumber",
      label: "Tracking #",
      key: "TrackingNumber",
      type: "text",
      placeholder: "e.g., 1ZV390E3000000000",
    },
    {
      name: "recordDate",
      label: "Record Date",
      key: "CreationDateTime",
      type: "date",
    },
  ];

  const filterFields = [
    {
      name: "company",
      label: "Company",
      key: "Company",
      type: "select",
      options: [
        { value: "", label: "All Companies" },
        { value: "PX/LEO/KRIZY", label: "PX/LEO/KRIZY" },
        { value: "SNOWBELL/XIE/PITY TECH", label: "SNOWBELL/XIE/PITY TECH" },
        { value: "Others", label: "Others" },
      ],
    },
    {
      name: "recorded",
      label: "Recorded",
      key: "Recorded",
      type: "checkbox",
      options: [
        { value: "recorded", label: "Recorded" },
        { value: "not_recorded", label: "Not Recorded" },
      ],
      getValue: (item) => (item.Recorded ? "recorded" : "not_recorded"),
    },
  ];

  const handleSearch = () => {
    fetch(`http://${apiBaseUrl}/return/`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    })
      .then((res) => res.json())
      .then(setRecords)
      .catch(console.error);
  };

    useEffect(() => {
      handleSearch();
    }, []);

  return (
    <GenericList
      items={records}
      columns={columns}
      searchFields={searchFields}
      filterFields={filterFields}
      basePath="/return"
      itemKey="TrackingNumber"
      onSearch={handleSearch}
    />
  );
}

export default ReturnReceivingList;
