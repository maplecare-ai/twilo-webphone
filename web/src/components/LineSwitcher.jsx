import React, { useEffect, useRef, useState } from 'react';
import { IconChevron, IconCheck, IconLines } from './icons.jsx';

// Sidebar control for the number the phone is currently acting as: it sets the caller ID
// on outbound calls, the sender on texts, scopes both history views, and decides which
// line's incoming calls ring here — the browser registers under that line's identity, so
// calls to the other lines go to whoever is on them, not to you.
// `busy` locks it during a call: switching re-registers the device, which would drop it.
export default function LineSwitcher({ lines, active, onSwitch, onManage, busy }) {
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
