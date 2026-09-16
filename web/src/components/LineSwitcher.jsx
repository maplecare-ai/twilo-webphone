import React, { useEffect, useRef, useState } from 'react';
import { IconChevron, IconCheck, IconLines } from './icons.jsx';

// Sidebar control for the number the phone is currently acting as: it sets the caller ID
// on outbound calls, the sender on texts, and scopes both history views. Inbound calls
// ring here whichever line they came in on, so switching never costs you a call.
export default function LineSwitcher({ lines, active, onSwitch, onManage }) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (!boxRef.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <div className="line-switch" ref={boxRef}>
      <button
        className={`ls-current ${open ? 'open' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={active ? `${active.label} — ${active.number}` : 'No line configured'}
      >
        <span className="ls-cap">Line</span>
        <span className="ls-label">{active ? active.label : 'No line'}</span>
        <span className="ls-num">{active ? active.number : 'Add one to start'}</span>
        <IconChevron className="ls-chev" />
      </button>

      {open && (
        <div className="ls-menu" role="listbox">
          {lines.map((l) => {
            const on = active && l.number === active.number;
            return (
              <button
                key={l.id}
                className={`ls-opt ${on ? 'on' : ''}`}
                role="option"
                aria-selected={on}
                onClick={() => { onSwitch(l); setOpen(false); }}
              >
                <span className="ls-opt-text">
                  <span className="ls-opt-label">{l.label}</span>
                  <span className="ls-opt-num">{l.number}</span>
                </span>
                {on && <IconCheck className="ls-tick" />}
              </button>
            );
          })}
          <button className="ls-manage" onClick={() => { setOpen(false); onManage(); }}>
            <IconLines /> <span>Manage lines</span>
          </button>
        </div>
      )}
    </div>
  );
}
