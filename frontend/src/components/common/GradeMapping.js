export const gradeMapping = grade => {
  switch (grade) {
    case 'X':
      return 'No Grade';
    case 'N':
      return 'Back To New';
    case 'W':
      return 'Brand New';
    case null:
      return '';
    default:
      return 'Grade ' + grade;
  }
}