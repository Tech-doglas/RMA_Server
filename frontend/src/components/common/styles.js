export const getOptionClass = (item, filterName) => {
  if (filterName === 'conditions') {
    switch (item) {
      case 'N':
      case 'Back To New':
        return 'bg-green-200';
      case 'A':
      case 'Grade A':
        return 'bg-orange-200';
      case 'B':
      case 'Grade B':
        return 'bg-yellow-200';
      case 'C':
      case 'Grade C':
        return 'bg-blue-200';
      case 'F':
      case 'Grade F':
        return 'bg-orange-300';
      default:
        return '';
    }
  } else if (filterName === 'inspectionRequest') {
    switch (item) {
      case 'A':
      case 'Full inspection':
        return 'bg-red-400';
      default:
        return '';
    }
  } else if (filterName === 'return_type') {
    switch (item) {
      case 'New Bulk':
        return 'bg-blue-300';
      case 'Old Bulk':
        return 'bg-gray-300';
      case 'Buyer':
        return 'bg-purple-300';
      default:
        return '';
    }
  }
  else if (filterName === 'dateAge') {
    const daysOld = item;
    if (daysOld > 4) return 'bg-red-300';
    return '';
  }
  return '';
};
