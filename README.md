# Web Phone

A browser softphone on Twilio — **make calls · receive calls · send & receive SMS**. React (Vite) + Node/Express.

Voice works with zero compliance paperwork. **Outbound SMS on a US/Canada long code additionally needs
[A2P 10DLC registration](https://www.twilio.com/docs/messaging/compliance/a2p-10dlc)** — until the number is
registered, sends fail and Twilio's own error (e.g. `30034`) is shown in the composer.

## What's inside
- `server/` — Express: mints Twilio access tokens, serves TwiML for outbound/inbound voice, sends and receives SMS,
  streams inbound ones live (SSE), pages through call + message history, and keeps the list of phone lines.
- `web/` — React UI: dialer, incoming-call answer/reject, SMS composer + threaded history, call history with
  recording playback, and a line switcher. Both history views page through Twilio's full record via cursor pagination.

## Lines
The phone can hold several Twilio numbers. The switcher at the top of the sidebar picks the **active line**, which sets:

- the caller ID on calls you place,
- the sender on texts you send,
- and the number both history views are scoped to.

Inbound calls ring the browser **whichever line they come in on** — switching never costs you a call — and the
incoming-call card names the line that was dialled. Add, rename and remove lines from *Manage lines* in the switcher;
the add form also lists the numbers already on your Twilio account, so most of the time it's a click.

Each number needs its own webhooks pointed here (Phone Numbers → the number, in the Twilio Console), exactly like
the first one:

- **Voice → A call comes in**: `PUBLIC_URL/voice/incoming` (POST)
- **Messaging → A message comes in**: `PUBLIC_URL/sms/incoming` (POST)

A number without those is in the switcher and can dial out, but nothing will ring or arrive on it.

**Where the list is stored.** By default `server/lines-store.json`, next to the code — fine for local dev. Set
`DATABASE_URL` and it goes to Postgres instead, which is what any deployed environment wants: a container
filesystem doesn't survive a redeploy, and this list is the only state the app owns. For local Postgres:

```bash
docker compose up -d     # postgres on :5432, data in a named volume
echo 'DATABASE_URL=postgres://webphone:webphone@localhost:5432/webphone' >> .env
```

The table is created on boot. A brand-new store seeds itself from `TWILIO_NUMBER` (or `TWILIO_NUMBERS`, if you'd
rather bring an environment up with several lines already in place) and is left alone from then on.

## 1. Install
```bash
npm run setup          # installs server + web deps
cp .env.example .env    # then fill it in (see below)
```

## 2. Twilio Console setup (one time)
You need an **upgraded** account and a **phone number**.
1. **API key** — Account → *API keys & tokens* → Create → copy the **SID** and **Secret** into
   `TWILIO_API_KEY_SID` / `TWILIO_API_KEY_SECRET`.
2. **TwiML App** — Voice → TwiML → *TwiML Apps* → create one. Set its **Voice URL** to
   `PUBLIC_URL/voice/outgoing` (POST). Copy its **SID** into `TWILIO_TWIML_APP_SID`.
3. **Phone number** — Phone Numbers → your number (repeat for every number you add as a line):
   - **Voice → A call comes in**: `PUBLIC_URL/voice/incoming` (POST)
   - **Messaging → A message comes in**: `PUBLIC_URL/sms/incoming` (POST)
4. Fill the rest of `.env` (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_NUMBER`, and an `APP_LOGIN_*`).

## 3. Expose webhooks (local dev)
Twilio must reach your machine, so tunnel port 3000:
```bash
ngrok http 3000
```
Copy the `https://…ngrok…` URL into `PUBLIC_URL` in `.env`, and use it for the three webhook URLs above.
(Re-running ngrok gives a new URL — update `.env` + the Console each time, or use a reserved domain.)

## 4. Run
```bash
npm run dev            # Express :3000 + Vite :5173
```
Open **http://localhost:5173**, sign in with your `APP_LOGIN_*`, and the status should go **Ready**.
Once it's working, set `VALIDATE_TWILIO=true` in `.env` to verify webhook signatures.

## 5. Verify (real account)
- **Make a call** — dial your cell → it rings → answer → two-way audio → Hang Up.
- **Receive a call** — call your Twilio number → the browser shows *Incoming* → Answer.
- **Receive SMS** — text your Twilio number → it appears in *Messages* live.
- **Switch lines** — add a second number under *Manage lines*, switch to it, and place a call: the person you
  reach sees that number. Call it back and the incoming card names the line it rang on.
- **Send SMS** — *Messages* → enter an E.164 number + body → Send (needs A2P 10DLC on US/CA long codes).
- **History** — *Calls* and *Messages* populate from Twilio's API; **Older / Newer** walks back through it a page
  at a time (the newest page auto-refreshes; paged-back views hold still).

## Production
```bash
npm run build          # builds the React app into web/dist
npm start              # Express serves web/dist + the API on one port
```
Point the three Twilio webhook URLs at your deployed HTTPS host instead of ngrok.

## Notes
- A browser softphone only rings **while the tab is open and registered**. `server/voice/incoming` includes a
  `<Say>` fallback for when nobody's registered — swap it for `<Record>` (voicemail) or a `<Dial>` to your cell.
- Received SMS persist in `server/sms-store.json` (gitignored). Swap for a DB later if you want.
- Adding **outbound SMS** later means registering A2P 10DLC in the Twilio Console first.
