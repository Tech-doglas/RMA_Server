import React, { useEffect } from 'react';

function Toast({ message, type , onClose, duration = 5000 }) {
  useEffect(() => {
    if (type === 'error' || !onClose) return undefined;
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [duration, onClose, type, message]);

  return (
    <div className="fixed top-4 right-4 left-4 sm:left-auto z-50 max-w-lg" role={type === 'error' ? 'alert' : 'status'}>
      <div className={`flex items-center gap-4 px-4 py-3 rounded shadow text-white
        ${type === 'success' ? 'bg-green-500' : 'bg-red-500'}`}>
        <span>{message}</span>
        {onClose && <button type="button" aria-label="Dismiss notification" onClick={onClose} className="p-2">×</button>}
      </div>
    </div>
  );
}

export default Toast;
