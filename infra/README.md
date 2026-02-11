# Infrastructure & CI/CD

This folder holds infrastructure and environment-based CI/CD for the Video Streaming (EduMeet) app.

## Git flow and branches

Branches and pipelines are aligned by name:

| Branch        | CI/CD workflow        | Docker Compose file                      | GitHub environment |
|---------------|------------------------|------------------------------------------|--------------------|
| **development** | `cicd/development.yml` | `docker-compose.development.yml`         | (none)             |
| **staging**     | `cicd/staging.yml`     | `docker-compose.staging.yml`             | `staging`          |
| **production**  | `cicd/production.yml`  | `docker-compose.production.yml`          | `production`       |

- **development** – Build, test, Docker build (`video-streaming:development-<sha>`), validate compose. No GitHub environment (no extra secrets).
- **staging** – Same, with `environment: staging` so you can set staging-only secrets in GitHub.
- **production** – Same, with `environment: production` and optional approval/protection in GitHub.

## Contents

- **`cicd/ci.yml`** – Generic CI (main/master): install, verify, Docker build.
- **`cicd/development.yml`** – CI for branch `development`: build, Docker build, compose validate.
- **`cicd/staging.yml`** – CI for branch `staging` (uses GitHub environment `staging`).
- **`cicd/production.yml`** – CI for branch `production` (uses GitHub environment `production`).
- **`docker-compose.yml`** – App + MongoDB (generic/local).
- **`docker-compose.development.yml`** – Development env (NODE_ENV=development).
- **`docker-compose.staging.yml`** – Staging env (NODE_ENV=staging, expects `JWT_SECRET` etc. from env).
- **`docker-compose.production.yml`** – Production env (NODE_ENV=production, all secrets from env).

## Enabling CI (GitHub Actions)

Workflows are already under `.github/workflows/` (development, staging, production). To sync from infra:

```bash
cp infra/cicd/development.yml .github/workflows/development.yml
cp infra/cicd/staging.yml     .github/workflows/staging.yml
cp infra/cicd/production.yml  .github/workflows/production.yml
```

In GitHub: create **Environments** `staging` and `production` (Settings → Environments) to use env-specific secrets and optional approval for production.

## Running with Docker Compose (env-based)

From the **repository root**:

```bash
# Development (defaults for JWT etc.)
docker compose -f infra/docker-compose.development.yml up -d

# Staging (set JWT_SECRET, MONGO_URI, BASE_URL)
JWT_SECRET=xxx docker compose -f infra/docker-compose.staging.yml up -d

# Production (all vars must be set)
export JWT_SECRET=xxx MONGO_URI=xxx BASE_URL=https://your-app.com
docker compose -f infra/docker-compose.production.yml up -d
```

Generic (no env in name):

```bash
docker compose -f infra/docker-compose.yml up -d
```

App: http://localhost:4000. MongoDB: localhost:27017.
