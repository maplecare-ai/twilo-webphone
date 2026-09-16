import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { IconPlus, IconTrash, IconClose, IconCheck } from './icons.jsx';

const toE164 = (s) => s.replace(/[^\d+]/g, '');
const valid = (s) => /^\+[1-9]\d{6,14}$/.test(toE164(s));

// Add, rename and remove the numbers the switcher offers. The list is server-side, so a
// line added here is there on the next device too.
export default function ManageLines({ lines, onChanged, onClose }) {
  const [number, setNumber] = useState('');
  const [label, setLabel] = useState('');
  const [names, setNames] = useState({});     // id → label being typed
  const [confirming, setConfirming] = useState(null);
  const [owned, setOwned] = useState([]);     // numbers on the Twilio account
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Suggestions only — the account may be unreachable, or hold numbers this phone should
  // not answer for, so the manual field stays the real input.
  useEffect(() => {
    let live = true;
    api.twilioNumbers()
      .then((r) => { if (live) setOwned(r.numbers || []); })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  const run = async (fn) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await onChanged();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const add = (e) => {
    e.preventDefault();
    if (busy || !valid(number) || !label.trim()) return;
    run(async () => {
      await api.addLine(toE164(number), label.trim());
      setNumber('');
      setLabel('');
    });
  };

  const rename = (line) => {
    const next = (names[line.id] ?? line.label).trim();
    if (!next || next === line.label) {
      setNames((n) => ({ ...n, [line.id]: undefined }));
      return;
    }
    run(() => api.updateLine(line.id, { label: next }));
  };

  const taken = new Set(lines.map((l) => l.number));
  const suggestions = owned.filter((n) => !taken.has(n.number));

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Manage lines">
        <div className="modal-head">
          <h2>Lines</h2>
          <button className="modal-x" onClick={onClose} aria-label="Close"><IconClose /></button>
        </div>

        <div className="ml-list">
          {lines.map((l) => (
            <div key={l.id} className="ml-row">
              {confirming === l.id ? (
                <>
                  <span className="ml-confirm">Remove <strong>{l.label}</strong>? Its history stays in Twilio.</span>
                  <button className="ml-btn" onClick={() => setConfirming(null)} disabled={busy}>Cancel</button>
                  <button
                    className="ml-btn danger"
                    disabled={busy}
                    onClick={() => run(async () => { await api.removeLine(l.id); setConfirming(null); })}
                  >
                    Remove
                  </button>
                </>
              ) : (
                <>
                  <input
                    className="ml-label"
                    value={names[l.id] ?? l.label}
                    onChange={(e) => setNames((n) => ({ ...n, [l.id]: e.target.value }))}
                    onBlur={() => rename(l)}
                    onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                    aria-label={`Name for ${l.number}`}
                    disabled={busy}
                  />
                  <span className="ml-num">{l.number}</span>
                  <button
                    className="ml-icon danger"
                    onClick={() => setConfirming(l.id)}
                    disabled={busy || lines.length === 1}
                    title={lines.length === 1 ? 'This is your only line' : `Remove ${l.label}`}
                    aria-label={`Remove ${l.label}`}
                  >
                    <IconTrash />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>

        <form className="ml-add" onSubmit={add}>
          <div className="ml-add-fields">
            <input
              className="ml-in"
              value={number}
              onChange={(e) => { setNumber(e.target.value); setError(null); }}
              placeholder="+14155550123"
              inputMode="tel"
              autoComplete="off"
              spellCheck="false"
              aria-label="New line number"
            />
            <input
              className="ml-in"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Name, e.g. Support"
              maxLength={40}
              aria-label="New line name"
            />
            <button className="btn-call ml-send" type="submit" disabled={busy || !valid(number) || !label.trim()}>
              <IconPlus /> Add
            </button>
          </div>
          {number && !valid(number) && <p className="ml-hint">Use E.164 format, e.g. +14155550123</p>}
          {error && <p className="ml-err">{error}</p>}
        </form>

        {suggestions.length > 0 && (
          <div className="ml-owned">
            <span className="ml-owned-cap">On your Twilio account</span>
            <div className="ml-chips">
              {suggestions.map((n) => (
                <button
                  key={n.number}
                  className="ml-chip"
                  onClick={() => { setNumber(n.number); setLabel((l) => l || n.label || ''); setError(null); }}
                  title={`Use ${n.number}`}
                >
                  {n.number}{n.label ? ` · ${n.label}` : ''}
                </button>
              ))}
            </div>
          </div>
        )}

        <p className="ml-foot">
          <IconCheck /> Point each number's <strong>Voice</strong> and <strong>Messaging</strong> webhooks at this
          server in the Twilio Console, or it won't ring or receive texts here.
        </p>
      </div>
    </div>
  );
}
