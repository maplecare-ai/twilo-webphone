import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { usePaged } from '../usePaged';
import Pager from './Pager.jsx';
import { IconSend, IconReply } from './icons.jsx';

const MAX = 1600;
const fmt = (t) => { try { return new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return t; } };
const isOutbound = (d) => (d || '').startsWith('outbound');
const toE164 = (s) => s.replace(/[^\d+]/g, '');
const valid = (s) => /^\+[1-9]\d{6,14}$/.test(toE164(s));

export default function SmsInbox({ line }) {
  // Memoised on the number: usePaged refetches whenever this identity changes, so an
  // inline arrow here would loop.
  const fetchSms = useCallback((opts) => api.sms({ ...opts, line: line?.number }), [line?.number]);
  const feed = usePaged(fetchSms, { resetKey: line?.number });
  const [to, setTo] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState(null);
  const [sent, setSent] = useState(false);
  const bodyRef = useRef(null);

  // Only the newest page auto-refreshes — polling while paged back would yank
  // the reader off the page they're reading. Inbound messages arrive over SSE, so the
  // interval is just a fallback for a dropped stream rather than the main mechanism.
  const onFirstPage = !feed.hasPrev;
  const active = line?.number;
  useEffect(() => {
    if (!onFirstPage) return undefined;
    const id = setInterval(feed.reload, 60000);
    const stream = new EventSource('/events');
    // The stream carries every line's inbound messages; a message for another line isn't
    // in this view, so reloading for it would just be a wasted round trip.
    stream.addEventListener('sms', (e) => {
      let to;
      try { ({ to } = JSON.parse(e.data)); } catch { /* malformed frame — just reload */ }
      if (!active || !to || to === active) feed.reload();
    });
    return () => { clearInterval(id); stream.close(); };
  }, [onFirstPage, active]);

  const send = async (e) => {
    e.preventDefault();
    if (sending || !valid(to) || !body.trim()) return;
    setSending(true);
    setSendError(null);
    try {
      await api.sendSms(toE164(to), body.trim(), line?.number);
      setBody('');
      setSent(true);
      setTimeout(() => setSent(false), 2500);
      feed.reset(); // the sent message belongs at the top of page 1
    } catch (err) {
      setSendError(err.message);
    } finally {
      setSending(false);
    }
  };

  const replyTo = (number) => {
    setTo(number || '');
    setSendError(null);
    bodyRef.current?.focus();
  };

  return (
    <div className="pane">
      <form className="card composer" onSubmit={send}>
        {line && (
          <div className="c-from">
            From <strong>{line.label}</strong> <span>{line.number}</span>
          </div>
        )}
        <input
          className="c-to"
          value={to}
          onChange={(e) => { setTo(e.target.value); setSendError(null); }}
          placeholder="To: +1 415 555 0123"
          inputMode="tel"
          autoComplete="off"
          spellCheck="false"
          aria-label="Recipient number"
        />
        <textarea
          ref={bodyRef}
          className="c-body"
          value={body}
          onChange={(e) => setBody(e.target.value.slice(0, MAX))}
          placeholder="Write a message…"
          rows={3}
          aria-label="Message"
        />
        <div className="composer-foot">
          <span className={`c-count ${body.length > MAX - 100 ? 'near' : ''}`}>{body.length} / {MAX}</span>
          {sendError && <span className="c-err">{sendError}</span>}
          {/* Send stays disabled until the number parses — say why rather than just greying out. */}
          {!sendError && to && !valid(to) && <span className="c-hint">Use E.164 format, e.g. +14155550123</span>}
          {sent && !sendError && <span className="c-ok">Message sent</span>}
          <button className="btn-call c-send" type="submit" disabled={sending || !valid(to) || !body.trim()}>
            <IconSend /> {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </form>

      <div className="pane-head">
        <h2>Messages</h2>
        {line && <span className="pane-scope">{line.label} · {line.number}</span>}
        <button className="chip-btn" onClick={feed.reload} disabled={feed.loading}>Refresh</button>
      </div>

      {feed.error && <div className="error">{feed.error}</div>}
      {feed.loading && feed.items.length === 0 && <div className="empty">Loading…</div>}
      {!feed.loading && feed.items.length === 0 && !feed.error && (
        <div className="empty">
          No messages on {line ? line.label : 'this line'} yet.<br />
          Send one above, or text {line ? line.number : 'your number'} to see it land here.
        </div>
      )}

      <div className="feed">
        {feed.items.map((m) => {
          const out = isOutbound(m.direction);
          const who = out ? m.to : m.from;
          return (
            <div key={m.sid || m.id} className={`msg ${out ? 'out' : ''}`}>
              <div className="msg-top">
                <span className="msg-from">{who}</span>
                <span className={`tag ${out ? 'out' : 'in'}`}>{out ? 'Sent' : 'Received'}</span>
                <button className="msg-reply" onClick={() => replyTo(who)} title={`Message ${who}`}>
                  <IconReply /><span>Reply</span>
                </button>
                <span className="msg-time">{fmt(m.receivedAt)}</span>
              </div>
              <div className="msg-body">{m.body}</div>
              {out && m.status && m.status !== 'delivered' && m.status !== 'sent' && (
                <div className="msg-status">{m.status}</div>
              )}
            </div>
          );
        })}
      </div>

      <Pager
        page={feed.page}
        pageCount={feed.pageCount}
        total={feed.total}
        exact={feed.exact}
        noun="messages"
        hasPrev={feed.hasPrev}
        hasNext={feed.hasNext}
        onPrev={feed.prev}
        onNext={feed.next}
        onGoto={feed.goto}
        loading={feed.loading}
      />
    </div>
  );
}
