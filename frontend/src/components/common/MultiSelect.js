import React, { useState, useEffect, useRef } from 'react';
import { getOptionClass } from './styles';

function MultiSelect({ name, options, value, onChange, label }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);
  const triggerRef = useRef(null);
  const listId = `filter-options-${name}`;

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
    <div className="relative w-full sm:w-80 max-w-full" ref={dropdownRef} onKeyDown={event => {
      if (event.key === 'Escape') { setIsOpen(false); triggerRef.current?.focus(); }
    }} onBlur={event => {
      if (!event.currentTarget.contains(event.relatedTarget)) setIsOpen(false);
    }}>
      <button
        type="button"
        ref={triggerRef}
        aria-label={label}
        aria-expanded={isOpen}
        aria-controls={listId}
        className="w-full text-left p-2 border border-gray-300 rounded bg-white"
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
      </button>
      {isOpen && (
        <div id={listId} role="group" aria-label={label} className="absolute top-full left-0 right-0 border border-gray-300 bg-white max-h-64 overflow-y-auto rounded shadow-lg z-50">
          {options.map((option) => (
            <label
              key={option.value}
              className={`flex items-center gap-3 p-3 min-h-11 cursor-pointer hover:bg-gray-100 ${
                value.includes(option.value) ? 'bg-gray-200' : ''
              }`}
            >
              <input type="checkbox" checked={value.includes(option.value)} onChange={() => handleOptionClick(option.value)} />
              {option.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

export default MultiSelect;
