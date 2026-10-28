import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './toast.css';

function ToastMessage({ message, type, onClose, duration }) {
  const anchor = useRef(null);
  const close = useRef(onClose);
  close.current = onClose;
  const [host, setHost] = useState(null);
  const [visible, setVisible] = useState(true);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);

  useLayoutEffect(() => {
    // Native dialogs are in the browser's top layer; their messages must stay there too.
    const parent = anchor.current.closest('dialog') || document.body;
    let stack = parent.querySelector(':scope > .app-toast-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.className = 'app-toast-stack';
      parent.appendChild(stack);
    }
    stack.toastUsers = (stack.toastUsers || 0) + 1;
    setHost(stack);
    return () => { if (--stack.toastUsers === 0) stack.remove(); };
  }, []);

  useEffect(() => {
    if (!visible || type === 'error' || duration <= 0 || hovered || focused) return undefined;
    const timer = setTimeout(() => { setVisible(false); close.current?.(); }, duration);
    return () => clearTimeout(timer);
  }, [duration, focused, hovered, type, visible]);

  return <><span ref={anchor} hidden />{host && visible && createPortal(
    <div className={'app-toast app-toast-' + type} role={type === 'error' ? 'alert' : 'status'} aria-atomic="true"
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}>
      <span className="app-toast-icon" aria-hidden="true">{type === 'success' ? '✓' : type === 'error' ? '!' : 'i'}</span>
      <span className="app-toast-message">{message}</span>
      <button type="button" aria-label="Dismiss notification" onClick={() => { setVisible(false); close.current?.(); }}>×</button>
    </div>, host)}</>;
}

export default function Toast({ message, type = 'info', onClose, duration = 5000 }) {
  return message ? <ToastMessage key={type + ':' + message} {...{ message, type, onClose, duration }} /> : null;
}
