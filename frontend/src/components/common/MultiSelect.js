import React, { useState, useEffect, useRef } from 'react';
import { getOptionClass } from './styles';

function MultiSelect({ name, options, value, onChange, label }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Handle clicks outside the dropdown to close it
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const handleOptionClick = (optionValue) => {
    const newValue = value.includes(optionValue)
      ? value.filter((v) => v !== optionValue)
      : [...value, optionValue];
    onChange({ target: { name, value: newValue } });
  };

  return (
    <div className="relative w-96 z-50" ref={dropdownRef}>
      <div
        className="p-2 border border-gray-300 rounded cursor-pointer bg-white"
        onClick={() => setIsOpen(!isOpen)}
      >
        {value.length > 0 ? (
          value.map((item) => (
            <span
              key={item}
              className={`inline-block px-2 py-1 m-1 rounded ${getOptionClass(item, name)}`}
            >
              {options.find((opt) => opt.value === item)?.label || item}
            </span>
          ))
        ) : (
          <span className="text-gray-500">{label}</span>
        )}
      </div>
      {isOpen && (
        <div className="absolute top-full left-0 right-0 border border-gray-300 bg-white max-h-48 overflow-y-auto rounded shadow-lg z-50">
          {options.map((option) => (
            <div
              key={option.value}
              className={`p-2 cursor-pointer hover:bg-gray-100 ${
                value.includes(option.value) ? 'bg-gray-200' : ''
              }`}
              onClick={() => handleOptionClick(option.value)}
            >
              {option.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default MultiSelect;