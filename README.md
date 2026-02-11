# Video Streaming (EduMeet)

Google Meet–like web app for live classes: WebRTC (P2P with relay), Socket.IO signaling, JWT auth, and class/chat APIs.

## Quick start

```bash
npm install
cp .env.example .env   # edit MONGO_URI, etc.
npm run dev
```

Open `http://<host>:<port>`, register/login, create a class, and open the class page to start or join.

**Seed demo data:** `npm run seed:db` creates users (admin, teachers, students), sample classes, and chat. All passwords: `password123`. Login e.g. `admin@example.com`, `alice@example.com`, `charlie@example.com`.

---

## Docker

The app is containerised with a multi-stage **Dockerfile** (Node 20 Alpine, non-root user).

**Build:**
```bash
docker build -t video-streaming .
```

**Run** (with MongoDB reachable at `MONGO_URI`):
```bash
docker run -p 4000:4000 \
  -e MONGO_URI=mongodb://host.docker.internal:27017/video-streaming \
  -e JWT_SECRET=your-secret \
  -e BASE_URL=http://localhost:4000 \
  video-streaming
```

**App + MongoDB together** (from repo root):
```bash
docker compose -f infra/docker-compose.yml up -d
```
App: http://localhost:4000. See [infra/README.md](infra/README.md) for details.

---

## Git flow & CI/CD

Branches **development**, **staging**, and **production** each have their own CI/CD pipeline (Docker build + Docker Compose validate). Workflows live in **`infra/cicd/`** and are wired under `.github/workflows/`:

| Branch        | Triggers              | Docker image tags                    | Compose file                          |
|---------------|------------------------|-------------------------------------|----------------------------------------|
| **development** | Push/PR to `development` | `video-streaming:development-<sha>`, `-latest` | `infra/docker-compose.development.yml` |
| **staging**     | Push/PR to `staging`     | `video-streaming:staging-<sha>`, `-latest`     | `infra/docker-compose.staging.yml`     |
| **production**  | Push/PR to `production`  | `video-streaming:production-<sha>`, `-latest`  | `infra/docker-compose.production.yml`  |

- **Staging** and **production** use GitHub Actions [environments](https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment) (`staging`, `production`) for env-specific secrets and optional approval.
- Run env-based compose locally: see [infra/README.md](infra/README.md).

---

## CI/CD (main/master)

- **`.github/workflows/ci.yml`** – Runs on push/PR to `main` or `master`: install, verify start, Docker build (no env-specific tag).
- Canonical pipeline definitions: **`infra/cicd/`** (including `ci.yml`, `development.yml`, `staging.yml`, `production.yml`).

---

## Run, test, and host

- **Run locally:** See [docs/RUN_AND_HOST.md](docs/RUN_AND_HOST.md) §1.
- **TURN/STUN:** No separate server required for basic use (default STUN). For production TURN, run coturn separately and set `TURN_URL` + `TURN_SECRET`. See [docs/RUN_AND_HOST.md](docs/RUN_AND_HOST.md) §2.
- **JMeter:** Seed data with `npm run seed`, then run `jmeter/video-streaming.jmx` from the `jmeter/` folder. Full steps in [docs/RUN_AND_HOST.md](docs/RUN_AND_HOST.md) §3 and [jmeter/README.md](jmeter/README.md).
- **Hosting:** Node + MongoDB + env + reverse proxy (HTTPS, WebSockets). Optional coturn on same or another host. See [docs/RUN_AND_HOST.md](docs/RUN_AND_HOST.md) §4.
