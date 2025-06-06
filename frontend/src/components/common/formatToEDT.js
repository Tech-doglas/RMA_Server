// Put this at the top of your file or in a utils/helper file
export function formatToEDT(dateString) {
  if (!dateString) return "";
  // This will display as EDT/EST depending on the current date
  return new Date(dateString).toLocaleString("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export function toSQLServerDateString(dateStr, withMilliseconds = true) {
  // dateStr is "YYYY-MM-DD"
  const now = new Date();
  const baseDate = new Date(dateStr);
  // Set the hours, minutes, seconds, milliseconds from now
  baseDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());

  const yyyy = baseDate.getFullYear();
  const mm = String(baseDate.getMonth() + 1).padStart(2, '0');
  const dd = String(baseDate.getDate()).padStart(2, '0');
  const HH = String(baseDate.getHours()).padStart(2, '0');
  const MM = String(baseDate.getMinutes()).padStart(2, '0');
  const SS = String(baseDate.getSeconds()).padStart(2, '0');
  const mmm = String(baseDate.getMilliseconds()).padStart(3, '0');

  if (withMilliseconds) {
    return `${yyyy}-${mm}-${dd} ${HH}:${MM}:${SS}.${mmm}`;
  } else {
    return `${yyyy}-${mm}-${dd} ${HH}:${MM}:${SS}`;
  }
}