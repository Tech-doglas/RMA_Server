import React, { useEffect, useRef, useState } from 'react';

export default function PhotoPreview({ url, name, label, alt }) {
  const [expanded, setExpanded] = useState(false);
  const [failed, setFailed] = useState(false);
  const dialogRef = useRef(null);
  const triggerRef = useRef(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!expanded || !dialog) return;
    const trigger = triggerRef.current;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal(); document.body.style.overflow = 'hidden';
    return () => {
      dialog.close(); document.body.style.overflow = previousOverflow;
      if (trigger?.isConnected) trigger.focus();
    };
  }, [expanded]);
  return <>
    {failed ? <p className="receiving-muted">Preview unavailable.</p> :
      <button ref={triggerRef} type="button" className="receiving-photo-thumbnail" aria-label={'Preview ' + label} aria-haspopup="dialog" onClick={() => setExpanded(true)}>
        <img src={url} alt={alt || name} onError={() => { setFailed(true); setExpanded(false); }} /><span>Preview</span>
      </button>}
    {expanded && <dialog ref={dialogRef} className="receiving-photo-dialog" aria-label={'Photo preview: ' + name} onCancel={() => setExpanded(false)}>
      <header><h2>{name}</h2><button type="button" className="secondary" onClick={() => setExpanded(false)}>Close preview</button></header>
      <img src={url} alt={'Full preview: ' + name} />
    </dialog>}
  </>;
}
