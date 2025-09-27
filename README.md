# KalpOrg Ticketing Support System

A full-stack customer support platform featuring realtime chat, ticketing, analytics, WebRTC voice/video calls, a Next.js dashboard, and React Native/Web SDKs.

## Features
- **Realtime chat** with Socket.io and automatic retry handling
- **Ticketing workflows** with statuses (Open, Pending, Hold, Closed) and priority levels
- **WebRTC calling** initiated by agents with offer/answer signalling
- **Analytics dashboard** summarising chats, tickets, calls, and response times
- **Developer SDKs** for React Native and a web widget
- **Swagger documentation** describing REST APIs and authentication

## Monorepo structure
```
server.js                # Express + Socket.io entry point
src/                     # Backend models, controllers, routes, sockets
  models/
  routes/
  controllers/
dashboard/               # Next.js App Router dashboard (Tailwind + shadcn/ui)
sdk/react-native/        # React Native SDK source
sdk/web/widget.js        # Lightweight web widget script
docs/                    # Swagger spec + markdown documentation
```

## Getting started
1. Install dependencies
   ```bash
   npm install
   ```
2. Provide environment variables (see `.env.example` template below):
   ```bash
   cp .env.example .env
   ```
3. Run the API server
   ```bash
   npm run dev
   ```
4. Launch the dashboard (requires separate install inside `dashboard/`)
   ```bash
   npm --prefix dashboard install
   npm run dashboard:dev
   ```

### .env.example
```
MONGO_URI=mongodb://localhost:27017/kalporg-support
JWT_SECRET=replace-me
CORS_ORIGIN=http://localhost:3000
```

## REST Endpoints
Key endpoints (see `/docs` for full Swagger schema):
- `POST /auth/login` – Agent authentication (JWT)
- `POST /chat/initiate` – Create customer chat session
- `POST /chat/message` – Persist chat messages
- `POST /ticket/create` – Create ticket
- `PUT /ticket/:id/status` – Update ticket status
- `GET /ticket/list` – Retrieve tickets
- `POST /call/initiate` – Start WebRTC call
- `POST /call/answer` – Accept WebRTC call
- `GET /analytics/summary` – Dashboard metrics

## SDKs
### React Native
```
npm install @kalporg/support-sdk
```
```tsx
import { KalpOrg } from '@kalporg/support-sdk';

export default function App() {
  return <KalpOrg apiKey="YOUR_API_KEY" />;
}
```

### Web Widget
```html
<script src="https://cdn.rapydsupport.com/widget.js" data-key="API_KEY"></script>
```

## Documentation
- Swagger UI: `http://localhost:4000/docs`
- Developer guide: [`docs/README.md`](docs/README.md)

## Scripts
- `npm run dev` – start API with Nodemon
- `npm run dashboard:dev` – run Next.js dashboard dev server
- `npm run sdk:build` – compile React Native SDK

## Testing
To be configured per deployment; recommend Jest for unit tests and Cypress for end-to-end coverage.
