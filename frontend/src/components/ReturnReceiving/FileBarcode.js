import React from 'react';

// Code 39 uses nine alternating bars/spaces per character (narrow or wide).
const patterns = {
  '0': 'nnnwwnwnn', '1': 'wnnwnnnnw', '2': 'nnwwnnnnw',
  '3': 'wnwwnnnnn', '4': 'nnnwwnnnw', '5': 'wnnwwnnnn',
  '6': 'nnwwwnnnn', '7': 'nnnwnnwnw', '8': 'wnnwnnwnn',
  '9': 'nnwwnnwnn', S: 'nnwnnnwwn', I: 'nnwnnwwnn',
  D: 'nnnnwwnnw', '-': 'nwnnnnwnw', '*': 'nwnnwnwnn',
};

export default function FileBarcode({ fileNo }) {
  let offset = 12;
  const bars = [];
  for (const char of '*' + fileNo.toUpperCase() + '*') {
    const pattern = patterns[char];
    for (let i = 0; i < pattern.length; i++) {
      const width = pattern[i] === 'w' ? 3 : 1;
      if (i % 2 === 0) bars.push(<rect key={offset} x={offset} y={0} width={width} height={36} />);
      offset += width;
    }
    offset += 1;
  }
  return <svg role="img" aria-label={'Barcode ' + fileNo} viewBox={'0 0 ' + (offset + 12) + ' 36'} width={260} height={54}>{bars}</svg>;
}
