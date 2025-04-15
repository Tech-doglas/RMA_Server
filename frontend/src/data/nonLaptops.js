const nonLaptops = [
  {
    ID: 1,
    TrackingNumber: "RA428003440US",
    ReceivedDate: "2025-04-01",
    Category: "Electronic",
    Name: "Google Nest Hub",
    OdooRef: "GN100022RA",
    InspectionRequest: "A",
    Condition: "B",
    Location: "On Pallet/A1",
    LastModifiedDateTime: "2025-04-10 10:00:00",
    LastModifiedUser: "admin",
    Remark: "Minor scratches",
    images: [],
  },
  {
    ID: 2,
    TrackingNumber: "RA428003441US",
    ReceivedDate: "2025-04-02",
    Category: "Monitor",
    Name: "Dell UltraSharp 27",
    OdooRef: "DELL200033RB",
    InspectionRequest: "C",
    Condition: "A",
    Location: "Shelf/B2",
    LastModifiedDateTime: "2025-04-12 14:30:00",
    LastModifiedUser: "user1",
    Remark: "No issues",
    images: [],
  },
];

// Generate additional non-laptops (repeating the pattern with variations)
for (let i = 3; i <= 50; i++) {
  const categoryIndex = (i - 1) % 4;
  const categories = ["Electronic", "Printer", "Monitor", "Other"];
  const names = [
    "Google Nest Hub",
    "HP LaserJet Pro",
    "Dell UltraSharp 27",
    "External Hard Drive",
  ];
  const inspectionRequests = ["A", "B", "C"];
  const conditions = ["N", "A", "B", "C", "F"];
  nonLaptops.push({
    ID: i,
    TrackingNumber: `RA428003${440 + i}US`,
    ReceivedDate: `2025-04-${(i % 30) + 1}`,
    Category: categories[categoryIndex],
    Name: `${names[categoryIndex]} ${i}`,
    OdooRef: `${categories[categoryIndex].toUpperCase().slice(0, 3)}${i}000${i}R`,
    InspectionRequest: inspectionRequests[i % 3],
    Condition: conditions[i % 5],
    Location: `Shelf/${String.fromCharCode(65 + (i % 10))}${i % 5}`,
    LastModifiedDateTime: `2025-04-${(i % 30) + 1} 10:00:00`,
    LastModifiedUser: `user${(i % 3) + 1}`,
    Remark: `Remark for item ${i}`,
    images: [],
  });
}

export default nonLaptops;