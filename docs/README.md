# KalpOrg Support Platform Documentation

Welcome to the KalpOrg Support Platform. This guide explains how to integrate the backend APIs, realtime messaging, SDKs, and webhook automations that power the Ticketing Support System.

## Table of Contents
1. [Getting Started](#getting-started)
2. [Authentication](#authentication)
3. [Realtime Chat & Calls](#realtime-chat--calls)
4. [Ticketing APIs](#ticketing-apis)
5. [Analytics](#analytics)
6. [Settings & Webhooks](#settings--webhooks)
7. [SDK Integration](#sdk-integration)
8. [Deployment Notes](#deployment-notes)

## Getting Started
1. Clone the repository and install dependencies:
   ```bash
   npm install
   ```
2. Provide environment variables:
   - `MONGO_URI` – MongoDB connection string
   - `JWT_SECRET` – secret string for signing agent JWTs
   - `CORS_ORIGIN` – comma separated list of allowed origins (defaults to `*`)
3. Start the development server:
   ```bash
   npm run dev
   ```
   Swagger documentation is available at `http://localhost:4000/docs`.

## Authentication
Agents authenticate via JWT. Register an admin or agent using `POST /auth/register`, then exchange email/password for a token via `POST /auth/login`. Include the token in the `Authorization: Bearer <token>` header for all protected routes.

## Realtime Chat & Calls
- **Initiate chat** with `POST /chat/initiate` supplying customer metadata. The response returns a `sessionId` used for websocket and REST messaging.
- **Send messages** via REST (`POST /chat/message`) or socket event `chat:message`.
- **Join sockets** with `socket.io` using handshake auth:
  ```js
  const socket = io('https://api.kalporg.com', {
    auth: { role: 'agent', token }
  });
  ```
  Customers connect anonymously by sending `{ role: 'customer', sessionId }`.
- **Voice/video calls** are initiated by agents through `POST /call/initiate` or the socket event `call:offer`. Customers answer with `POST /call/answer` or `call:answer`. ICE candidates are relayed with the `call:ice-candidate` event.
- **Auto-reconnect**: the server emits `connection:ready` with a retry interval (default `1000ms`). Clients retry on `disconnect` using exponential backoff if desired.

## Ticketing APIs
- `POST /ticket/create` – create a ticket with status (Open, Pending, Hold, Closed) and priority (Low, Medium, High, Urgent).
- `PUT /ticket/:id/status` – update ticket status.
- `GET /ticket/list` – filter by `status`, `priority`, or `assignedTo`.
- `POST /chat/ticket` – convert a chat session into a ticket transcript.

Tickets support note attachments through `POST /ticket/:id/notes` for internal or public notes.

## Analytics
`GET /analytics/summary` aggregates dashboard metrics:
- total chats handled
- tickets by status
- total and active calls
- average first response time (minutes)

## Settings & Webhooks
- `GET /settings/{accountId}` retrieves account configuration including business hours and webhook targets.
- `PUT /settings/{accountId}` updates availability defaults, weekly schedule, and webhook integrations.

Webhook deliveries include an HMAC signature header (`x-rapyd-signature`) when a secret is provided.

## SDK Integration
### React Native SDK (`@kalporg/support-sdk`)
```bash
npm install @kalporg/support-sdk
```
Example usage:
```jsx
import { KalpOrg } from '@kalporg/support-sdk';

export default function App() {
  return <KalpOrg apiKey="YOUR_API_KEY" />;
}
```
The component mounts a ready-to-use chat screen. Override styling via the `theme` prop or pass a custom `renderMessage` component.

### Web Widget
Embed the widget script in any webpage:
```html
<script src="https://cdn.rapydsupport.com/widget.js" data-key="API_KEY"></script>
```
The widget automatically bootstraps a chat bubble and registers customer metadata collected from `window.RapydSupport`.

## Deployment Notes
- Deploy the backend on Node.js 18+ with HTTPS enabled for WebRTC.
- Configure TURN servers if supporting external customers.
- Align dashboard environment variables (`NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SOCKET_URL`) with deployment domains.
- Run `npm --prefix dashboard run build` to compile the Next.js dashboard prior to production.

For further reference see the auto-generated Swagger docs and inline code comments throughout the repository.
