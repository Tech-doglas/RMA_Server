const returnReceivingRecords = [
  {
    TrackingNumber: "1ZV390E3000000000",
    Company: "PX/LEO/KRIZY",
    CreationDateTime: "2025-04-01 09:00:00",
    Remark: "Package intact",
    Recorded: false,
    image: null,
  },
  {
    TrackingNumber: "1ZV390E3000000001",
    Company: "SNOWBELL/XIE/PITY TECH",
    CreationDateTime: "2025-04-02 12:00:00",
    Remark: "Damaged box",
    Recorded: true,
    image: null,
  },
];

// Generate additional return receiving records (repeating the pattern with variations)
for (let i = 3; i <= 50; i++) {
  const companyIndex = (i - 1) % 3;
  const companies = ["PX/LEO/KRIZY", "SNOWBELL/XIE/PITY TECH", "Others"];
  returnReceivingRecords.push({
    TrackingNumber: `1ZV390E300000${i.toString().padStart(4, '0')}`,
    Company: companies[companyIndex],
    CreationDateTime: `2025-04-${(i % 30) + 1} ${i % 24}:${i % 60}:${i % 60}`,
    Remark: `Remark for record ${i}`,
    Recorded: i % 2 === 0,
    image: null,
  });
}

export default returnReceivingRecords;