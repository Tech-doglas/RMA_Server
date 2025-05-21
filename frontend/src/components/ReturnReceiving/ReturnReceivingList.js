import React, { useState, useEffect } from "react";
import GenericList from "../common/GenericList";

function ReturnReceivingList({ department }) {
  const [records, setRecords] = useState([]);

  const columns = [
    { key: "TrackingNumber", label: "Tracking #" },
    { key: "Company", label: "Company" },
    { key: "Code", label: "Code" },
    { key: "CreationDateTime", label: "Record DateTime" },
    {
      key: "Recorded",
      label: "Recorded",
      render: (item) => (item.Recorded ? "✅" : "❌"),
    },
  ];

  const companyOptions =
  department === "SnowBell"
    ? [
        { value: "SNOWBELL/XIE/PITY TECH", label: "SNOWBELL/XIE/PITY TECH" },
      ]
    : [
        { value: "", label: "All Companies" },
        { value: "PX/LEO/KRIZY", label: "PX/LEO/KRIZY" },
        { value: "SNOWBELL/XIE/PITY TECH", label: "SNOWBELL/XIE/PITY TECH" },
        { value: "Others", label: "Others" },
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
      options: companyOptions,
    },
    {
      name: "code",
      label: "Code",
      key: "Code",
      type: "select",
      options: [
        { value: "", label: "All Codes" },
        { value: "0000", label: "0000" },
        { value: "000A", label: "000A" },
        { value: "000B", label: "000B" },
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
    fetch(`http://${window.location.hostname}:8088/return/`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    })
      .then((res) => res.json())
      .then((data) => {
        if (department === "SnowBell") {
          setRecords(data.filter(item => item.Company === "SNOWBELL/XIE/PITY TECH"));
        } else {
          setRecords(data);
        }
      })
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
