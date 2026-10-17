import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
export default function Modal({ title, subtitle, children, close, className='' }) {
  const dialog = useRef(null);
  const titleId=useId();
  useEffect(() => { const el = dialog.current; el.showModal(); return () => el.close(); }, []);
  return <dialog ref={dialog} className={className} aria-labelledby={titleId} onCancel={close} onClick={e=>{if(e.target===dialog.current)close();}}><div className="modal-heading"><div><span className="eyebrow">ECHELON / CONFIGURATION</span><h2 id={titleId}>{title}</h2>{subtitle&&<p>{subtitle}</p>}</div><button className="icon-button" aria-label="Close dialog" onClick={close}><X size={20}/></button></div>{children}</dialog>;
}
