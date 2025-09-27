# Integration APIs & Realtime Signals

This document summarises the REST and WebSocket surfaces that power the multi-host Control Center, one-to-one calling, and direct messaging features. All endpoints live under the `/api` namespace unless noted otherwise.

## Authentication & Key Management

### Create developer key
`POST /api/developer/keys`

*Requires authenticated teacher session.*

Body:
```json
{ "label": "My Org" }
```

Response:
```json
{ "key": "dev_...", "label": "My Org" }
```

### Create host key for a developer
`POST /api/developer/projects/:code/keys`

Headers:
- `x-developer-key`: developer master key

Body (optional fields):
```json
{
  "label": "Team A",
  "projectSlug": "team-a"
}
```

Response returns the new `host_...` key.

## Meeting Lifecycle

### Create meeting with host key
`POST /api/host/meetings`

Headers:
- `x-host-key`

Body:
```json
{ "title": "Weekly Stand-up" }
```

Response payload contains `meeting.code`, `meetingLink`, and associated key references.

### Invite participants via API
`POST /api/host/meetings/:code/invite`

Headers:
- `x-host-key`

Body:
```json
{
  "participants": [
    { "displayName": "Jane", "token": "janes-seat" },
    { "displayName": "Lou" }
  ]
}
```

The server issues (or reuses) join tokens and flags them for automatic admission.

### Confirm invite / auto join
`POST /api/meetings/:code/join`

Body:
```json
{ "token": "janes-seat" }
```

The response echoes the join token and meeting metadata. When supplied to the standard `/classes/:code/join` web endpoint, the user bypasses the lobby.

## Chat & Media Controls

### Fetch group chat history
`GET /api/meetings/:code/chat`

Query parameters:

- `limit` (default `100`, max `500`)
- `before` (ISO timestamp cursor for pagination)

Responses are chronological (oldest ➜ newest) and include pagination metadata:

```json
{
  "messages": [ /* ascending list */ ],
  "nextCursor": "2024-05-01T17:12:00.120Z",
  "latestCursor": "2024-05-01T17:18:44.901Z",
  "hasMore": true
}
```

Supply the returned `nextCursor` as the next request's `before` value to continue paging older history. The endpoint is rate limited to 240 requests per minute per chat room.

### Send a system or host chat message
`POST /api/host/meetings/:code/chat`

Headers:
- `x-host-key`

Body:
```json
{ "message": "We are starting shortly", "sender": { "name": "Host Bot" } }
```

All attendees receive the message over Socket.io (`chat:new`).

### Update recording state
`POST /api/host/meetings/:code/recording`

Body:
```json
{ "recording": true }
```

### Toggle screen share from automation
`POST /api/host/meetings/:code/screen`

Body:
```json
{ "active": true }
```

Triggers a broadcast (`screen:api-toggle`) prompting the host UI to align with automation.

## WebSocket Signals

All real-time actions share the existing Socket.io channel used for WebRTC signalling.

### Direct chat
* Client ➜ server: `direct:chat:send { target, message, media? }`
* Server ➜ client: `direct:chat:new { id, from, to, message, createdAt, media?, seen }`
* Server ➜ client: `direct:chat:seen { from, messageIds }`
* Client ➜ server: `direct:chat:history { target, limit?, cursor? }`
* Server ➜ client (ack): `{ messages, nextCursor, hasMore }`

### One-to-one calls
* Client ➜ server: `direct:call:initiate { target, media }`
* Server ➜ callee: `direct:call:ring { from, fromName, media }`
* Callee ➜ server: `direct:call:response { target, accepted }`
* Either side ➜ server: `direct:call:signal { target, data }` (offer/answer/candidate payloads)
* Either side ➜ server: `direct:call:end { target }`
* Either side ➜ server: `direct:call:cancel { target }`

The Control Center automatically retries ICE negotiation on failure and falls back to TURN when supplied in the `rtcConfig` array.

## Presence & Quality Metrics

Hosts receive per-participant connection states via the Control Center view. WebRTC `connectionState` transitions are mapped to human friendly labels (`Stable`, `Reconnecting`, `Failed`) and surfaced next to each attendee alongside mute/video toggles, raised-hand approvals, direct call shortcuts, and live connection telemetry (upload/download bitrate in kbps plus average jitter) derived from `RTCPeerConnection.getStats()`.

## Support SDK Embedding

Embed the JavaScript SDK (built from `/public/sdk/sdk.js`) to initialise meetings inside external apps or support widgets:

```html
<script src="/public/sdk/sdk.js"></script>
<script>
  const client = window.VVDLive.init({ developerKey: 'dev_...', hostKey: 'host_...' });
  client.joinMeeting({ code: '123-456-789', token: 'seat-token' });
</script>
```

The SDK exposes `initMeeting`, `joinMeeting`, `sendMessage`, `raiseHand`, and `startCall` helpers for both web and the React Native bridge.

## Rate limits

Integration endpoints ship with burst protection:

- Developer key creation: 20 requests/min per authenticated user.
- Host key creation: 120 requests/min per developer key.
- Meeting creation: 60 requests/min per host key.
- Participant invites: 200 requests/min per host key.
- Chat history fetch: 240 requests/min per room.
- Chat send: 120 requests/min per room.
- Recording toggle: 30 requests/5 min per meeting.
- Screen toggle: 60 requests/5 min per meeting.

Direct messages use the same limits, persisting history to MongoDB so web and mobile clients can page conversations without losing state.

