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
      ? [{ value: "SNOWBELL/XIE/PITY TECH", label: "SNOWBELL/XIE/PITY TECH" }]
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

  const handleSearch = (searchParams) => {
    // Check if the user entered any filters
    const hasAnyFilters = Object.entries(searchParams).some(([key, value]) => {
      if (Array.isArray(value)) return value.length > 0;
      return value?.trim?.();
    });

    // Normalize 'company' and 'code' to strings
    let normalizedParams = { ...searchParams };
    if (Array.isArray(normalizedParams.company)) {
      normalizedParams.company = normalizedParams.company[0] || "";
    }
    if (Array.isArray(normalizedParams.code)) {
      normalizedParams.code = normalizedParams.code[0] || "";
    }

    const finalParams = hasAnyFilters
      ? normalizedParams
      : { recorded: ["not_recorded"] };

    fetch(`http://${window.location.hostname}:8088/return/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(finalParams),
    })
      .then((res) => res.json())
      .then((data) => {
        if (department === "SnowBell") {
          setRecords(
            data.filter((item) => item.Company === "SNOWBELL/XIE/PITY TECH")
          );
        } else {
          console.log(data);
          setRecords(data);
        }
      })
      .catch(console.error);
  };

  useEffect(() => {
    handleSearch({ recorded: ["not_recorded"] });
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
      Xie={true}
    />
  );
}

export default ReturnReceivingList;
