import React, { useEffect, useRef, useState } from 'react';
import { IconBackspace, IconPhone } from './icons.jsx';
import { clock } from '../useCallTimer';

const KEYS = [
  ['1', ''], ['2', 'ABC'], ['3', 'DEF'],
  ['4', 'GHI'], ['5', 'JKL'], ['6', 'MNO'],
  ['7', 'PQRS'], ['8', 'TUV'], ['9', 'WXYZ'],
  ['*', ''], ['0', '+'], ['#', ''],
];

const clean = (s) => s.replace(/[^\d+*#\s()-]/g, '');
const toDial = (s) => s.replace(/[^\d+*#]/g, '');

// The call clock is owned by App — this component unmounts on every tab switch, and
// timing it from here restarted the count each time.
export default function Dialer({ onCall, activeCall, onHangup, status, startedAt, elapsed, line }) {
  const [num, setNum] = useState('');
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const press = (k) => { setNum((n) => clean(n + k)); inputRef.current?.focus(); };
  const back = () => setNum((n) => n.slice(0, -1));
  const call = () => { const d = toDial(num); if (d) onCall(d); };
  const onKeyDown = (e) => { if (e.key === 'Enter' && status === 'ready') call(); };

  return (
    <>
      <div className="num-field">
        <input
          ref={inputRef}
          className="num-input"
          value={num}
          onChange={(e) => setNum(clean(e.target.value))}
          onKeyDown={onKeyDown}
          placeholder="Enter a number"
          inputMode="tel"
          autoComplete="off"
          spellCheck="false"
          aria-label="Phone number"
        />
        <button className="bksp" onClick={back} disabled={!num} aria-label="Backspace"><IconBackspace /></button>
      </div>

      <div className="keypad">
        {KEYS.map(([k, sub]) => (
          <button key={k} className="key" onClick={() => press(k)} tabIndex={-1}>
            <span className="key-main">{k}</span>
            <span className="key-sub">{sub}</span>
          </button>
        ))}
      </div>

      {activeCall ? (
        <>
          <div className={`call-live ${startedAt ? 'on' : ''}`}>
            <span className={`beacon ${startedAt ? 'is-ready' : 'is-connecting'}`} />
            <span className="call-live-label">{startedAt ? 'In call' : 'Connecting…'}</span>
            {startedAt && <span className="call-live-time">{clock(elapsed)}</span>}
          </div>
          <button className="btn-hangup" onClick={onHangup}>End call</button>
        </>
      ) : (
        <>
          {/* The number the person you're calling will see — worth saying outright once
              there's more than one to pick from. */}
          {line && (
            <div className="dial-from">
              Caller ID <strong>{line.label}</strong> <span>{line.number}</span>
            </div>
          )}
          <button className="btn-call" onClick={call} disabled={status !== 'ready' || !line || !toDial(num)}>
            <IconPhone /> Call
          </button>
        </>
      )}
    </>
  );
}
