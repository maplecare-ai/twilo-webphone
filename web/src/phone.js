import { Device } from '@twilio/voice-sdk';
import { api } from './api';

// Twilio Voice error codes we can explain better than the SDK's own wording. Anything
// not listed falls through to the SDK's message, which is still more useful than "Error".
const EXPLAIN = {
  20101: 'The access token is invalid — check TWILIO_API_KEY_SID and TWILIO_API_KEY_SECRET.',
  20104: 'The access token expired. Reconnect to mint a fresh one.',
  31000: 'The Voice SDK hit a generic error. Reconnecting usually clears it.',
  31003: 'Could not negotiate audio. A firewall or VPN may be blocking WebRTC.',
  31005: 'Lost the connection to Twilio. Check your network and reconnect.',
  31009: 'No transport available — the connection to Twilio dropped.',
  31201: 'No microphone is available. Plug one in, or pick another input device.',
  31204: 'The access token signature is invalid — the API key secret is probably wrong.',
  31205: 'The access token expired. Reconnect to mint a fresh one.',
  31207: 'The access token lifetime is too long for Twilio to accept.',
  31208: 'Microphone access was blocked. Allow it in the browser, then reconnect.',
  31402: 'The browser could not open the microphone.',
  31474: 'The TwiML App SID on this token is wrong or missing.',
  53000: 'The signalling connection to Twilio failed.',
};

// Turn whatever the SDK (or our own fetch) threw into one sentence a human can act on.
export function describeError(e) {
  if (!e) return 'Something went wrong.';
  const code = e.code ?? e.originalError?.code ?? e.cause?.code;
  const text = EXPLAIN[code] || e.explanation || e.description || e.message || String(e);
  return code ? `${text} (Twilio error ${code})` : text;
}

// Wrap the Twilio Voice Device: fetch a token, register, and surface events.
// `line` decides which identity the browser registers as, and so which number's calls
// reach it — a device registered for one line is never rung by another.
export async function createDevice({ line, onStatus, onIncoming }) {
  let token;
  try {
    ({ token } = await api.token(line));
  } catch (e) {
    // The server refused to mint a token — that's a config or session problem, not a
    // WebRTC one, so say which rather than letting it look like a device failure.
    throw new Error(`Could not get an access token — ${e.message}`);
  }
  const device = new Device(token, { logLevel: 'error' });

  device.on('registered', () => onStatus('ready'));
  device.on('unregistered', () => onStatus('offline'));
  device.on('error', (e) => { console.error('Device error', e); onStatus('error', describeError(e)); });
  device.on('incoming', (call) => onIncoming(call));

  // Tokens expire (~1h) — refresh so the device stays registered.
  device.on('tokenWillExpire', async () => {
    try {
      const { token: fresh } = await api.token(line);
      device.updateToken(fresh);
    } catch (e) {
      console.error('token refresh failed', e);
      onStatus('error', `The access token could not be refreshed and will expire shortly — ${e.message}`);
    }
  });

  await device.register();
  return device;
}
