import React, { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import { createDevice, describeError } from "./phone";
import Login from "./components/Login.jsx";
import Dialer from "./components/Dialer.jsx";
import IncomingCall from "./components/IncomingCall.jsx";
import SmsInbox from "./components/SmsInbox.jsx";
import CallHistory from "./components/CallHistory.jsx";
import CallBar from "./components/CallBar.jsx";
import LineSwitcher from "./components/LineSwitcher.jsx";
import ManageLines from "./components/ManageLines.jsx";
import { useCallTimer } from "./useCallTimer";
import {
  IconKeypad,
  IconMessage,
  IconPhone,
  IconSupport,
  IconLogout,
} from "./components/icons.jsx";

const TABS = [
  ["dialer", "Keypad", IconKeypad],
  ["sms", "Messages", IconMessage],
  ["calls", "Calls", IconPhone],
];
const STATUS_LABEL = {
  ready: "Live",
  offline: "Offline",
  connecting: "Connecting",
  error: "Error",
};

// Which line you were last on, so a reload doesn't drop you back on the default one.
const LINE_KEY = "webphone.active-line";
const readLine = () => {
  try {
    return localStorage.getItem(LINE_KEY);
  } catch {
    return null;
  }
};

function Blobs() {
  return (
    <div className="blobs">
      <div className="blob b1" />
      <div className="blob b2" />
      <div className="blob b3" />
      <div className="blob b4" />
    </div>
  );
}

export default function App() {
  const [authed, setAuthed] = useState(null);
  const [status, setStatus] = useState("connecting");
  const [statusMsg, setStatusMsg] = useState(null);
  const [retry, setRetry] = useState(0);
  const [tab, setTab] = useState("dialer");
  const [incoming, setIncoming] = useState(null);
  const [activeCall, setActiveCall] = useState(null);
  const [lines, setLines] = useState([]);
  const [fallbackNumber, setFallbackNumber] = useState(null);
  const [activeNumber, setActiveNumber] = useState(readLine);
  const [managing, setManaging] = useState(false);
  const deviceRef = useRef(null);
  // Above the tabs, so switching views doesn't restart the count.
  const { startedAt, elapsed } = useCallTimer(activeCall);

  // If the store is unreachable the list comes back empty, but the server still dials with
  // TWILIO_NUMBER — so stand one in rather than disabling the keypad over it.
  const known =
    lines.length || !fallbackNumber
      ? lines
      : [{ id: "default", number: fallbackNumber, label: "Main line" }];
  // The stored number may have been removed from another device — fall back to the first
  // line rather than leaving the phone pointed at a line that no longer exists.
  const line = known.find((l) => l.number === activeNumber) || known[0] || null;

  useEffect(() => {
    api
      .me()
      .then((m) => {
        setLines(m.lines || []);
        setFallbackNumber(m.number || null);
        setAuthed(true);
      })
      .catch(() => setAuthed(false));
  }, []);

  useEffect(() => {
    if (!line) return;
    try {
      localStorage.setItem(LINE_KEY, line.number);
    } catch {
      /* private mode */
    }
  }, [line?.number]);

  const refreshLines = useCallback(
    () => api.lines().then((r) => setLines(r.lines || [])),
    [],
  );

  useEffect(() => {
    if (authed !== true) return;
    let device;
    setStatus("connecting");
    setStatusMsg(null);
    createDevice({
      onStatus: (state, message) => {
        setStatus(state);
        setStatusMsg(message || null);
      },
      onIncoming: (call) => {
        setIncoming(call);
        call.on("cancel", () => setIncoming(null));
        call.on("disconnect", () => {
          setIncoming(null);
          setActiveCall(null);
        });
        call.on("reject", () => setIncoming(null));
      },
    })
      .then((d) => {
        device = d;
        deviceRef.current = d;
      })
      .catch((e) => {
        console.error(e);
        setStatus("error");
        setStatusMsg(describeError(e));
      });
    return () => {
      try {
        device && device.destroy();
      } catch {
        /* noop */
      }
    };
  }, [authed, retry]);

  if (authed === null)
    return (
      <div className="boot">
        Web Phone<span className="blink">_</span>
      </div>
    );
  if (!authed) return <Login onLoggedIn={() => window.location.reload()} />;

  const startCall = async (number) => {
    const device = deviceRef.current;
    if (!device) return;
    // From rides along to /voice/outgoing, which turns it into the caller ID — that is
    // what makes the switcher change which number the person you're calling sees.
    const params = { To: number };
    if (line) params.From = line.number;
    const call = await device.connect({ params });
    setActiveCall(call);
    call.on("disconnect", () => setActiveCall(null));
    call.on("cancel", () => setActiveCall(null));
    call.on("error", () => setActiveCall(null));
  };
  const hangup = () => {
    if (activeCall) activeCall.disconnect();
    setActiveCall(null);
  };
  const acceptIncoming = () => {
    if (!incoming) return;
    incoming.accept();
    setActiveCall(incoming);
    setIncoming(null);
  };
  const rejectIncoming = () => {
    if (incoming) incoming.reject();
    setIncoming(null);
  };
  const logout = async () => {
    await api.logout();
    window.location.reload();
  };

  const PAGE = {
    dialer: {
      title: "Keypad",
      sub: line
        ? `Calls go out as ${line.label} · ${line.number}.`
        : "Add a line to start calling.",
    },
    sms: {
      title: "Messages",
      sub: line
        ? `Texts to and from ${line.label} · ${line.number}.`
        : "Add a line to start texting.",
    },
    calls: {
      title: "Calls",
      sub: line ? `Call activity on ${line.label}.` : "Your recent call activity.",
    },
  }[tab];

  return (
    <>
      <Blobs />
      <div className="app">
        <aside className="sidebar">
          <div className="sb-logo">
            <div className="name">Web Phone</div>
          </div>

          <LineSwitcher
            lines={known}
            active={line}
            onSwitch={(l) => setActiveNumber(l.number)}
            onManage={() => setManaging(true)}
          />

          <nav className="sb-nav">
            {TABS.map(([t, label, Icon]) => (
              <button
                key={t}
                className={`sb-item ${tab === t ? "active" : ""}`}
                onClick={() => setTab(t)}
              >
                <Icon />
                <span>{label}</span>
              </button>
            ))}
          </nav>
          {/* The keypad shows its own live-call strip, so this stands in everywhere else. */}
          {activeCall && tab !== "dialer" && (
            <CallBar
              startedAt={startedAt}
              elapsed={elapsed}
              onOpen={() => setTab("dialer")}
              onHangup={hangup}
            />
          )}
          <div className="sb-foot">
            <div className="sb-status">
              {/* `is-` prefixed so a status of "error" can't collide with the .error
                  alert class and inflate the dot into a padded box. */}
              <span
                className={`beacon is-${status}`}
                title={statusMsg || STATUS_LABEL[status] || status}
              />
              <span className="s-label">{STATUS_LABEL[status] || status}</span>
              {/* One registration answers for every line, so this counts them rather
                  than naming the one in the switcher above. */}
              <span className="s-num">
                {known.length} {known.length === 1 ? "line" : "lines"}
              </span>
            </div>
            <button className="sb-action">
              <IconSupport />
              <span>Need support</span>
            </button>
            <button className="sb-action danger" onClick={logout}>
              <IconLogout />
              <span>Logout</span>
            </button>
          </div>
        </aside>

        <main className="main">
          <h1 className="page-title">{PAGE.title}</h1>
          <p className="page-sub">{PAGE.sub}</p>

          {status === "error" && (
            <div className="alert">
              <div className="alert-text">
                <strong>The phone isn’t registered.</strong>{" "}
                {statusMsg || "The Twilio device could not connect."}
              </div>
              <button
                className="alert-retry"
                onClick={() => setRetry((n) => n + 1)}
              >
                Reconnect
              </button>
            </div>
          )}

          {!known.length && (
            <div className="alert">
              <div className="alert-text">
                <strong>No lines yet.</strong> Add a Twilio number to call and text
                from.
              </div>
              <button className="alert-retry" onClick={() => setManaging(true)}>
                Add a line
              </button>
            </div>
          )}

          {tab === "dialer" && (
            <div className="card dialer">
              <Dialer
                onCall={startCall}
                activeCall={activeCall}
                onHangup={hangup}
                status={status}
                startedAt={startedAt}
                elapsed={elapsed}
                line={line}
              />
            </div>
          )}
          {tab === "sms" && <SmsInbox line={line} />}
          {tab === "calls" && <CallHistory line={line} />}
        </main>

        {incoming && (
          <IncomingCall
            call={incoming}
            onAccept={acceptIncoming}
            onReject={rejectIncoming}
          />
        )}

        {managing && (
          <ManageLines
            lines={lines}
            onChanged={refreshLines}
            onClose={() => setManaging(false)}
          />
        )}
      </div>
    </>
  );
}
