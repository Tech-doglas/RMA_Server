import React, { useEffect } from 'react';

function Toast({ message, type = 'success', onClose, duration = 3000 }) {
  useEffect(() => {
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [duration, onClose]);

  return (
    <div className={`fixed top-4 right-4 z-50`}>
      <div className={`px-4 py-3 rounded shadow text-white
        ${type === 'success' ? 'bg-green-500' : 'bg-red-500'}`}>
        {message}
      </div>
    </div>
  );
}

export default Toast;
