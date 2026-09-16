import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api, recordingMedia } from '../api';
import { usePaged } from '../usePaged';
import Pager from './Pager.jsx';
import { IconPlay, IconPause, IconDownload, IconVolume, IconVolumeOff } from './icons.jsx';

const fmt = (t) => { try { return new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return t; } };
const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const isInbound = (d) => (d || '').includes('inbound');

// Volume outlives any one row — the player closes on every page turn.
const VOL_KEY = 'webphone.recording-volume';
const readVolume = () => {
  try {
    const v = Number(localStorage.getItem(VOL_KEY));
    return Number.isFinite(v) && v >= 0 && v <= 1 ? v : 1;
  } catch {
    return 1;
  }
};

export default function CallHistory({ line }) {
  // Memoised on the number: usePaged refetches whenever this identity changes, so an
  // inline arrow here would loop.
  const fetchCalls = useCallback((opts) => api.calls({ ...opts, line: line?.number }), [line?.number]);
  const feed = usePaged(fetchCalls, { resetKey: line?.number });
  const [loaded, setLoaded] = useState(null);   // sid of the row whose audio is in the element
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);
  const [failed, setFailed] = useState(null);
  const [volume, setVolume] = useState(readVolume);
  const [muted, setMuted] = useState(false);
  const audioRef = useRef(null);
  const scrubbing = useRef(false);              // don't let timeupdate fight the drag

  // <audio> volume isn't a React prop, so push it whenever it changes — and again on
  // `loaded`, since swapping the src resets nothing but re-mounts the controls.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
    audio.muted = muted;
    try { localStorage.setItem(VOL_KEY, String(volume)); } catch { /* private mode */ }
  }, [volume, muted, loaded]);

  // Turning the page unmounts the open player — stop the audio with it.
  useEffect(() => {
    audioRef.current?.pause();
    setLoaded(null);
    setPlaying(false);
    setPos(0);
  }, [feed.page]);

  // One shared <audio>: opening a row's player takes over from whatever was loaded.
  const toggle = (call) => {
    const audio = audioRef.current;
    if (!audio) return;
    if (loaded === call.sid) {
      if (playing) audio.pause();
      else audio.play().catch(() => setFailed(call.sid));
      return;
    }
    setFailed(null);
    setPos(0);
    setDur(Number(call.duration) || 0); // until the file reports its own length
    audio.src = recordingMedia(call.recordingSid);
    setLoaded(call.sid);
    audio.play().catch(() => { setLoaded(null); setPlaying(false); setFailed(call.sid); });
  };

  const seek = (seconds) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = seconds;
    setPos(seconds);
  };

  return (
    <div className="pane">
      <div className="pane-head">
        <h2>Calls</h2>
        {line && <span className="pane-scope">{line.label} · {line.number}</span>}
        <button className="chip-btn" onClick={feed.reload} disabled={feed.loading}>Refresh</button>
      </div>
      {feed.error && <div className="error">{feed.error}</div>}
      {feed.loading && feed.items.length === 0 && <div className="empty">Loading…</div>}
      {!feed.loading && feed.items.length === 0 && !feed.error && (
        <div className="empty">No calls on {line ? line.label : 'this line'} yet.</div>
      )}
      <div className="feed">
        {feed.items.map((c) => {
          const inbound = isInbound(c.direction);
          const num = inbound ? c.from : c.to;
          const open = loaded === c.sid;
          const total = Number(c.duration || 0);
          return (
            <div key={c.sid} className={`callrow ${open ? 'playing' : ''}`}>
              <div className="callrow-main">
                <span className={`arrow ${inbound ? 'in' : 'out'}`}>{inbound ? '↙' : '↗'}</span>
                <div className="callrow-mid">
                  <div className="callrow-top">
                    <span className="callrow-num">{num || 'Unknown'}</span>
                    <span className={`tag ${inbound ? 'in' : 'out'}`}>{inbound ? 'Incoming' : 'Outgoing'}</span>
                  </div>
                  <span className="callrow-sub">
                    {c.status} · {total}s
                    {failed === c.sid && ' · recording unavailable'}
                  </span>
                </div>
                <span className="callrow-time">{fmt(c.startTime)}</span>
                {c.recordingSid ? (
                  <button
                    className={`play-btn ${open && playing ? 'on' : ''}`}
                    onClick={() => toggle(c)}
                    title={open && playing ? 'Pause' : 'Play recording'}
                  >
                    {open && playing ? <IconPause /> : <IconPlay />}
                    <span>{open ? (playing ? 'Pause' : 'Resume') : 'Play recording'}</span>
                  </button>
                ) : (
                  // Says why there's no button, rather than leaving a silent gap.
                  <span className="no-rec">No recording</span>
                )}
              </div>

              {open && (
                <div className="rec-player">
                  <span className="rec-time">{clock(pos)}</span>
                  <input
                    type="range"
                    className="rec-seek"
                    min="0"
                    max={dur || 0}
                    step="0.1"
                    value={Math.min(pos, dur || 0)}
                    // Paints the played portion of the track (WebKit has no ::-moz-range-progress).
                    style={{ '--pct': `${dur ? (Math.min(pos, dur) / dur) * 100 : 0}%` }}
                    onPointerDown={() => { scrubbing.current = true; }}
                    onPointerUp={() => { scrubbing.current = false; }}
                    onChange={(e) => seek(Number(e.target.value))}
                    aria-label="Seek recording"
                  />
                  <span className="rec-time">{clock(dur)}</span>

                  <button
                    className={`rec-icon-btn ${muted ? 'off' : ''}`}
                    onClick={() => setMuted((m) => !m)}
                    title={muted ? 'Unmute' : 'Mute'}
                    aria-label={muted ? 'Unmute' : 'Mute'}
                    aria-pressed={muted}
                  >
                    {muted || volume === 0 ? <IconVolumeOff /> : <IconVolume />}
                  </button>
                  <input
                    type="range"
                    className="rec-seek rec-vol"
                    min="0"
                    max="1"
                    step="0.05"
                    value={muted ? 0 : volume}
                    style={{ '--pct': `${(muted ? 0 : volume) * 100}%` }}
                    // Dragging off zero is an unmute; dragging to zero is a mute.
                    onChange={(e) => { const v = Number(e.target.value); setVolume(v); setMuted(v === 0); }}
                    title={`Volume ${Math.round((muted ? 0 : volume) * 100)}%`}
                    aria-label="Volume"
                  />

                  <a
                    className="rec-icon-btn"
                    href={`${recordingMedia(c.recordingSid)}?download`}
                    title="Download recording"
                    aria-label="Download recording"
                  >
                    <IconDownload />
                  </a>
                </div>
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
        noun="calls"
        hasPrev={feed.hasPrev}
        hasNext={feed.hasNext}
        onPrev={feed.prev}
        onNext={feed.next}
        onGoto={feed.goto}
        loading={feed.loading}
      />

      <audio
        ref={audioRef}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) setDur(d);
        }}
        onTimeUpdate={(e) => { if (!scrubbing.current) setPos(e.currentTarget.currentTime); }}
        onEnded={() => { setPlaying(false); setPos(0); }}
        onError={() => { if (loaded) { setFailed(loaded); setLoaded(null); setPlaying(false); } }}
        style={{ display: 'none' }}
      />
    </div>
  );
}
