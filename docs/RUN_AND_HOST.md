# Run, Test, and Host the Video Streaming Service

This guide covers: running the app locally, testing the configuration, whether you need a separate TURN/STUN server, how to run JMeter tests, and how to host the service.

---

## 1. Running the service locally

### Prerequisites

- **Node.js** (v18 or later)
- **MongoDB** running locally or a connection string (e.g. MongoDB Atlas)

### Steps

1. **Clone and install**

   ```bash
   cd video-streaming
   npm install
   ```

2. **Environment**

   Copy the example env and edit as needed:

   ```bash
   cp .env.example .env
   ```

   For local dev you can leave defaults or set:

   ```env
   PORT=4000
   BASE_URL=http://localhost:4000
   MONGO_URI=mongodb://localhost:27017/video-streaming
   JWT_SECRET=your-secret
   ```

   STUN/TURN are optional (see section 2).

3. **Start the app**

   ```bash
   npm run dev
   ```

   Server runs at `http://localhost:4000`. API docs: `http://localhost:4000/docs`.

4. **Health checks**

   - **Basic (for load balancers / readiness):** `GET http://localhost:4000/health` — returns `status`, `uptimeSeconds`, `version`; 503 if DB is down.
   - **Detailed (for dashboards / debugging):** `GET http://localhost:4000/health/detailed` — returns DB ping latency, process memory, uptime, and safe config flags.

5. **Quick test**

   - Register: `POST http://localhost:4000/auth/register` with `{ "name", "email", "password", "role": "teacher" }`.
   - Login: `POST http://localhost:4000/auth/login` with `{ "email", "password" }` → get `token`.
   - Create class: `POST http://localhost:4000/classes` with `Authorization: Bearer <token>` and `{ "title": "Test" }` → get `classId`.
   - Open in browser: `http://localhost:4000/class/<classId>`, set `localStorage.vs_token = <token>`, then Start class / Join and test video.

---

## 1.1 Running with Docker and testing in the container

You can run the full stack (Node app + MongoDB) with Docker Compose and test from the host or inside the app container.

### Prerequisites

- **Docker** and **Docker Compose** installed.

### Run the stack

From the **repository root** (`video-streaming/`):

```bash
# Production-style (default compose)
docker compose -f infra/docker-compose.yml up -d

# Or development (NODE_ENV=development)
docker compose -f infra/docker-compose.development.yml up -d
```

This builds the app image (if needed), starts MongoDB with a healthcheck, then starts the app on port **4000**. The app uses `MONGO_URI=mongodb://mongo:27017/video-streaming` inside the network.

- **App:** `http://localhost:4000` (API docs: `http://localhost:4000/docs`)
- **MongoDB:** `localhost:27017` (only if you need to connect from the host)

### Test from the host

Same as local run: use browser, Postman, or curl:

```bash
# Health / docs
curl -s http://localhost:4000/docs

# Register and login (then use the token for /classes, etc.)
curl -s -X POST http://localhost:4000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@example.com","password":"password123","role":"teacher"}'
curl -s -X POST http://localhost:4000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'
```

### Run commands inside the app container

Use the **service name** from the compose file (e.g. `app`).

**Option A: One-off command**

```bash
# From repo root
docker compose -f infra/docker-compose.yml run --rm app node -e "console.log('Node OK')"

# Seed JMeter data (uses MONGO_URI from compose)
docker compose -f infra/docker-compose.yml run --rm app npm run seed

# Seed DB (if you have scripts/seed-db.js)
docker compose -f infra/docker-compose.yml run --rm app node scripts/seed-db.js
```

**Option B: Open a shell in the running app container**

```bash
# Start stack first: docker compose -f infra/docker-compose.yml up -d
docker compose -f infra/docker-compose.yml exec app sh
```

Then inside the container:

```sh
# Container shell (Alpine)
node -v
npm start          # runs the app (optional; app is already running in another process)
node -e "require('http').get('http://localhost:4000', r => console.log(r.statusCode))"
exit
```

**Option C: Run a one-off shell in a new container**

```bash
docker compose -f infra/docker-compose.yml run --rm app sh
# then run node, npm, curl (if installed), etc.
exit
```

### Test inside the container (no curl by default)

The image is `node:20-alpine`, so `curl` is not installed by default. To hit the app from inside the same container you can use Node:

```bash
docker compose -f infra/docker-compose.yml exec app node -e "
require('http').get('http://localhost:4000', r => {
  let b = ''; r.on('data', c => b += c); r.on('end', () => console.log('Status:', r.statusCode, 'Body length:', b.length));
}).on('error', e => console.error(e));
"
```

Or install curl in a one-off run (not persisted):

```bash
docker compose -f infra/docker-compose.yml run --rm app sh -c "apk add --no-cache curl && curl -s -o /dev/null -w '%{http_code}' http://app:4000"
```

(Use hostname `app` when calling the app from another container in the same compose; from inside the app container use `localhost:4000`.)

### Stop and clean up

```bash
docker compose -f infra/docker-compose.yml down
# Remove MongoDB data as well:
docker compose -f infra/docker-compose.yml down -v
```

### Summary (Docker)

| Task | Command |
|------|--------|
| Start stack | `docker compose -f infra/docker-compose.yml up -d` |
| Logs | `docker compose -f infra/docker-compose.yml logs -f app` |
| Shell in app container | `docker compose -f infra/docker-compose.yml exec app sh` |
| One-off command | `docker compose -f infra/docker-compose.yml run --rm app <cmd>` |
| Seed JMeter data | `docker compose -f infra/docker-compose.yml run --rm app npm run seed` |
| Stop | `docker compose -f infra/docker-compose.yml down` |

---

## 2. TURN and STUN: do you need to host them separately?

### Short answer

- **STUN**: No separate server needed for this app. It uses a public STUN server by default (`stun:stun.l.google.com:19302`). You can keep that or point `STUN_URL` to your own.
- **TURN**: Optional. If you don’t set `TURN_URL` and `TURN_SECRET`, the app works with STUN only (many networks will work). For production reliability (strict NATs/firewalls), run a **separate TURN server** (e.g. coturn) and configure this app to use it.

So: **this Node app does not include a TURN/STUN server**. It only tells the browser which ICE servers to use. STUN is satisfied by the default public server; TURN, when you want it, is a separate process (usually on the same or another host).

### Option A: No TURN (simplest)

- Don’t set `TURN_URL` or `TURN_SECRET`.
- App returns only STUN in `/api/webrtc/ice-servers` (and your config’s default STUN).
- Good for: local dev, testing, or networks where P2P works.

### Option B: Your own TURN server (production)

1. **Run coturn** on a machine with a public IP (can be the same VPS as the app or a dedicated one).

   Example (Ubuntu):

   ```bash
   sudo apt update && sudo apt install -y coturn
   sudo systemctl enable coturn
   ```

2. **Configure coturn** (e.g. `/etc/turnserver.conf`):

   ```conf
   listening-port=3478
   fingerprint
   lt-cred-mech
   use-auth-secret
   static-auth-secret=YOUR_TURN_SECRET
   realm=your-domain.com
   ```

3. **In this app’s env** (same secret as above):

   ```env
   TURN_URL=turn:your-turn-host.example.com:3478
   TURN_SECRET=YOUR_TURN_SECRET
   ```

4. Restart the app. Authenticated clients will get TURN in `iceServers` (STUN first, then TURN). The app generates short-lived TURN credentials; coturn validates them with `use-auth-secret`.

### Summary

| Component | Hosted separately? | Notes |
|----------|--------------------|--------|
| STUN | No (default uses Google) | Or set `STUN_URL` to your own. |
| TURN | Yes (e.g. coturn) | Only if you set `TURN_URL` + `TURN_SECRET`. |

---

## 3. Running JMeter test cases

JMeter stresses the **HTTP API** (and optionally Socket.IO with a plugin). It does **not** drive real WebRTC media.

### 3.1 Install JMeter

- Download [Apache JMeter](https://jmeter.apache.org/download_jmeter.cgi) (e.g. 5.6+) and unzip.
- Optional: add [JMeter Plugins](https://jmeter-plugins.org/) (e.g. WebSocket Samplers) if you want to test Socket.IO.

### 3.2 Start your app and MongoDB

```bash
# Terminal 1: ensure MongoDB is running, then:
npm run dev
```

Leave the server running at `http://localhost:4000` (or your `BASE_URL`).

### 3.3 Generate test data (CSV)

From the **project root**:

```bash
npm run seed
# or: node jmeter/scripts/seed-for-jmeter.js
```

This uses `config` (and thus `.env` / `NODE_ENV`). It creates:

- `jmeter/data/teachers.csv` (e.g. 100 teachers)
- `jmeter/data/students.csv` (e.g. 50 students per class)
- `jmeter/data/classes.csv`

To change scale, set in `.env` (or env-specific file):

```env
JMETER_NUM_CLASSES=100
JMETER_STUDENTS_PER_CLASS=50
```

For 100 attendees per class, set `JMETER_STUDENTS_PER_CLASS=100` and run the seed again.

### 3.4 Run the JMeter plan

1. Open JMeter (e.g. `jmeter.bat` on Windows, `jmeter` on Linux/macOS).
2. **File → Open** and select `video-streaming/jmeter/video-streaming.jmx`.
3. **Run from the `jmeter` folder** so CSV paths resolve:
   - Either: in a terminal, `cd jmeter` then run:
     ```bash
     jmeter -t video-streaming.jmx
     ```
   - Or: in JMeter GUI, set “Working Directory” or edit each **CSV Data Set Config** and set the full path to `jmeter/data/teachers.csv` and `jmeter/data/students.csv`.
4. If your server is not on `localhost:4000`, edit the **HTTP Request** samplers (or HTTP Request Defaults) and set the correct host/port.
5. Run the test (e.g. **Run → Start** in GUI, or run non-GUI as above).

### 3.5 What the test does

- **Thread group 1 – Students:** Logs in each student and calls `POST /classes/:id/join` (students join the lobby).
- **Thread group 2 – Teachers:** Logs in each teacher, `GET /classes/:id`, `PATCH /classes/:id/start` (start class).

Teachers and students are serialized (students first, then teachers). To also test **admit** at scale, add a loop in the “Teachers” thread group that calls `POST /classes/:id/admit` or `POST /classes/:id/admit-batch` with the student IDs from your CSV (see `jmeter/README.md` for details).

### 3.6 View results

Use **View Results Tree** and **Summary Report** (or similar listeners) in JMeter to check response times, errors, and throughput.

---

## 4. Hosting the service

### 4.1 What you need

- A **Node.js** host (VPS, cloud VM, or container).
- **MongoDB** (same server, separate server, or managed e.g. Atlas).
- Optional: a **TURN server** (e.g. coturn) on a host with a public IP (can be the same box).

### 4.2 Example: single VPS (Ubuntu)

1. **Install Node and MongoDB** (or use a remote MongoDB URI).

2. **Clone and install**

   ```bash
   cd /opt
   git clone <your-repo> video-streaming
   cd video-streaming
   npm install --production
   ```

3. **Environment**

   Create `.env` or use systemd env file:

   ```env
   NODE_ENV=production
   PORT=4000
   BASE_URL=https://your-domain.com
   MONGO_URI=mongodb://localhost:27017/video-streaming
   JWT_SECRET=<strong-secret>
   STUN_URL=stun:stun.l.google.com:19302
   TURN_URL=turn:your-domain.com:3478
   TURN_SECRET=<same-as-coturn>
   ```

4. **Process manager (e.g. PM2)**

   ```bash
   npm install -g pm2
   pm2 start server.js --name video-streaming
   pm2 save && pm2 startup
   ```

   Or use **systemd**: create a unit file that runs `node server.js` from the app directory with the correct `NODE_ENV` and env vars.

5. **Reverse proxy (HTTPS)**

   Put Nginx (or Caddy) in front and proxy to `http://127.0.0.1:4000`. Enable WebSockets for Socket.IO, e.g. in Nginx:

   ```nginx
   location / {
     proxy_pass http://127.0.0.1:4000;
     proxy_http_version 1.1;
     proxy_set_header Upgrade $http_upgrade;
     proxy_set_header Connection "upgrade";
     proxy_set_header Host $host;
     proxy_set_header X-Real-IP $remote_addr;
   }
   ```

6. **TURN (optional)**  
   Install and configure coturn on the same or another server; open UDP/TCP 3478 (and range for relay if configured). Use the same `TURN_SECRET` in the app.

### 4.3 Hosting checklist

| Item | Notes |
|------|--------|
| **Node** | Run `node server.js` or `npm start` (e.g. via PM2 or systemd). |
| **MongoDB** | Set `MONGO_URI`; ensure DB is reachable and backed up. |
| **BASE_URL** | Set to the public URL users use (e.g. `https://your-domain.com`). |
| **JWT_SECRET** | Strong, random secret in production. |
| **STUN** | Default is fine; or set `STUN_URL` to your own. |
| **TURN** | Optional; run coturn separately and set `TURN_URL` + `TURN_SECRET`. |
| **HTTPS** | Use a reverse proxy (Nginx/Caddy) with SSL. |
| **WebSockets** | Proxy must support WebSocket (Socket.IO). |

### 4.4 Staging / production scripts

Your `package.json` already has:

- `npm run dev` – development
- `npm run stage` – staging (with `.env.staging` if present)
- `npm run prod` – production (with `.env.production` if present)
- `npm run seed` – seed JMeter data (uses current `NODE_ENV`/config)

For production, run with `NODE_ENV=production` and a proper `.env` or `.env.production`.

---

## 5. Quick reference

| Task | Command / action |
|------|-------------------|
| Run locally | `npm run dev` (MongoDB + Node) |
| **Run in Docker** | From repo root: `docker compose -f infra/docker-compose.yml up -d` |
| **Shell in container** | `docker compose -f infra/docker-compose.yml exec app sh` |
| **Test in container** | `docker compose -f infra/docker-compose.yml run --rm app npm run seed` (or `exec app sh` then run commands) |
| Health (basic) | `GET /health` — 200 when OK, 503 when DB down. |
| Health (detailed) | `GET /health/detailed` — DB latency, memory, uptime, config flags. |
| Test config | Use `/auth/login`, `/classes`, `/class/:id` in browser or Postman; check `/api/webrtc/ice-servers` with auth. |
| STUN only | Omit `TURN_URL` / `TURN_SECRET`. |
| Add TURN | Run coturn; set `TURN_URL` and `TURN_SECRET` in this app. |
| JMeter data | `npm run seed` from project root. |
| JMeter run | Open `jmeter/video-streaming.jmx`, run from `jmeter/` or fix CSV paths. |
| Host service | Node + MongoDB + env + reverse proxy (HTTPS, WebSocket); optionally coturn on same or other host. |

For more detail on JMeter scenarios and CSV format, see `jmeter/README.md`.
