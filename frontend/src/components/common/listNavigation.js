import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

const lists = new Set(['/return', '/return/manage', '/return/ship', '/return/legacy', '/pc', '/non-pc', '/xie', '/admin']);
export function validList(path) {
  return typeof path === 'string' && lists.has(path.split(/[?#]/)[0]) ? path : null;
}
export function listOrigin(location, fallback) {
  return validList(location.state?.returnTo) || validList(new URLSearchParams(location.search).get('from')) || fallback;
}
export function RecordLink({ state, ...props }) {
  const location = useLocation();
  const returnTo = listOrigin(location, validList(location.pathname + location.search));
  return <Link {...props} state={{ ...state, returnTo }} />;
}
export function BackToListing({ fallback, className = 'app-button secondary' }) {
  const location = useLocation();
  return <Link className={className} to={listOrigin(location, fallback)}>← Back to listing</Link>;
}

// Keep browsing settings within this browser tab when a detail page unmounts the list.
export function useListState(key, initial) {
  const location = useLocation();
  const storageKey = 'list-view:' + location.pathname + ':' + key;
  const [value, setValue] = useState(() => {
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved !== null) return JSON.parse(saved);
    } catch (_) { /* Storage can be unavailable in private browsing. */ }
    return typeof initial === 'function' ? initial() : initial;
  });
  useEffect(() => {
    try { sessionStorage.setItem(storageKey, JSON.stringify(value)); } catch (_) { /* Keep navigation available. */ }
  }, [storageKey, value]);
  return [value, setValue];
}
