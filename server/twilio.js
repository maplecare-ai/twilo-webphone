const twilio = require('twilio');

const {
  TWILIO_ACCOUNT_SID,
  TWILIO_API_KEY_SID,
  TWILIO_API_KEY_SECRET,
  TWILIO_AUTH_TOKEN,
  TWILIO_TWIML_APP_SID,
  TWILIO_NUMBER,
  TWILIO_IDENTITY = 'webphone',
  TWILIO_REST_AUTH = 'apikey',
} = process.env;

// REST client (calls.list for history) authenticated with the API key — revocable on its
// own, so it's the right default. TWILIO_REST_AUTH=token swaps in the account's auth token
// instead, which unblocks history and messaging when the API key secret has been lost (it
// is shown once at creation and never again). Voice is unaffected by this switch: access
// tokens for the browser SDK can only be signed by an API key secret, so the dialer still
// needs a working key either way.
const useAuthToken = TWILIO_REST_AUTH === 'token';
const restClient = useAuthToken
  ? twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
  : twilio(TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET, { accountSid: TWILIO_ACCOUNT_SID });
if (useAuthToken) console.warn('TWILIO_REST_AUTH=token — REST calls use the auth token; voice still needs a valid API key.');

// One client identity per line. Inbound calls are routed by identity, so a browser
// registered as webphone-15105550123 can only be rung by the number it belongs to —
// that is what stops a call to one line ringing everyone sitting on the others.
// Twilio identities allow [A-Za-z0-9_.-] only, so the "+" of E.164 is dropped.
function identityFor(number) {
  const digits = String(number == null ? '' : number).replace(/\D/g, '');
  return digits ? `${TWILIO_IDENTITY}-${digits}` : TWILIO_IDENTITY;
}

// Mint a short-lived Voice access token the browser SDK registers with.
function mintToken(identity = TWILIO_IDENTITY) {
  const { AccessToken } = twilio.jwt;
  const { VoiceGrant } = AccessToken;
  const token = new AccessToken(TWILIO_ACCOUNT_SID, TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET, {
    identity,
    ttl: 3600,
  });
  token.addGrant(new VoiceGrant({
    outgoingApplicationSid: TWILIO_TWIML_APP_SID, // outbound: hits our /voice/outgoing
    incomingAllow: true,                          // inbound: allow <Client> to ring here
  }));
  return { token: token.toJwt(), identity };
}

module.exports = {
  twilio,
  restClient,
  mintToken,
  identityFor,
  TWILIO_NUMBER,
  TWILIO_IDENTITY,
  TWILIO_ACCOUNT_SID,
  TWILIO_API_KEY_SID,
  TWILIO_API_KEY_SECRET,
};
