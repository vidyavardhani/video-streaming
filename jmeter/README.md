# JMeter Load Test Plan – Video Streaming API

This folder contains everything needed to load-test the video streaming app for **100 users (teachers)** with **50 or 100 attendees (students)** per class.

## What JMeter Can Test

- **HTTP API**: Auth (login), class (get, start, join, admit, admit-batch), chat. Fully supported.
- **Socket.IO**: Use a JMeter WebSocket/Socket.IO plugin to open connections and emit `joinRoom` / `register-peer` to stress the signaling server.
- **WebRTC media**: JMeter cannot drive real PeerConnections; use browser-based tools or real users for media load.

## Prerequisites

1. **JMeter 5.x** installed (e.g. from [Apache JMeter](https://jmeter.apache.org/download_jmeter.cgi)).
2. **Optional**: JMeter WebSocket Samplers plugin (e.g. “WebSocket Samplers by Peter Doornbosch”) if you want to test Socket.IO.
3. **Server** running at `BASE_URL` (default `http://localhost:4000`).
4. **MongoDB** running with the app.

## 1. Generate Test Data (CSV)

Use the seed script to create users and classes and write CSV files for JMeter:

```bash
# From project root
node jmeter/scripts/seed-for-jmeter.js
```

This creates:

- `jmeter/data/teachers.csv` – 100 teachers: `email,password,classId`
- `jmeter/data/students.csv` – 5000 students (50 per class): `email,password,classId`
- `jmeter/data/classes.csv` – 100 class IDs (same as in teachers.csv)

To target **100 attendees per user**, change `STUDENTS_PER_CLASS` in the script to `100` and re-run (will create 10,000 students).

## 2. CSV Format (if you create them manually)

**teachers.csv** (delimiter: comma, no header in file if using “Ignore first line” in JMeter, or add header and ignore):

```text
email,password,classId
teacher1@test.com,password123,<classId1>
teacher2@test.com,password123,<classId2>
...
```

**students.csv**:

```text
email,password,classId
student1@test.com,password123,<classId1>
student2@test.com,password123,<classId1>
...
student51@test.com,password123,<classId2>
...
```

**classes.csv** (optional; one classId per line if you use a separate file):

```text
classId
<classId1>
<classId2>
...
```

## 3. Test Scenarios

### Scenario A: 100 teachers × 50 attendees (API only)

1. **Students join lobby**  
   - Thread Group: 5000 threads (or 100 × 50 loops).  
   - Each thread: `POST /auth/login` → extract token → `POST /classes/${classId}/join` with `displayName`.  
   - Use `students.csv` so each student has a `classId`.

2. **Teachers start and admit**  
   - Thread Group: 100 threads.  
   - Each thread:  
     - `POST /auth/login` → save token (e.g. `vs_token` or JMeter variable).  
     - `GET /classes/${classId}` (with `Authorization: Bearer ${token}`).  
     - `PATCH /classes/${classId}/start`.  
     - Admit 50 students: either **50 ×** `POST /classes/${classId}/admit` with `studentId`, or **1 ×** `POST /classes/${classId}/admit-batch` with `{"studentIds": ["id1", "id2", ...]}` (build array in JSR223 PreProcessor if needed).  
   - Use `teachers.csv` for `email`, `password`, `classId`.

### Scenario B: Scale to 100 attendees per user

- Same as above, but:
  - Generate 10,000 students (100 per class) and update `students.csv`.
  - In the “Teachers” thread group, admit 100 students (loop 100 with single admit, or one admit-batch of 100).

### Scenario C: Socket.IO (signaling load)

- Add a WebSocket/Socket.IO sampler (or plugin) that:
  1. Connects to `BASE_URL` (Socket.IO handshake).
  2. Emits `joinRoom` with `{ classId, userId, name, role }`.
  3. Emits `register-peer` with `{ classId, role }`.
- You can reuse the same CSV so each “user” has a token and classId; use the token to derive or look up userId if the plugin needs it.

## 4. Using the Included JMX Plan

1. Run the seed script from project root: `node jmeter/scripts/seed-for-jmeter.js` (creates `jmeter/data/*.csv`).
2. Open JMeter and load `video-streaming.jmx` (from the `jmeter/` folder).
3. **Run JMeter from the `jmeter/` directory** so that the CSV paths `data/students.csv` and `data/teachers.csv` resolve to `jmeter/data/`. Alternatively, edit each CSV Data Set Config and set the full path to your `jmeter/data/*.csv` files.
4. In each HTTP request, the server is set to `localhost` and port `4000`; change if your server runs elsewhere.
5. Run the test. For a short run, use 1 iteration; for a full load, keep 100 teacher threads and 100×50 student iterations (students join first, then teachers start and admit).

The JMX includes:

- **HTTP Request Defaults**: server base URL.
- **Teacher flow**: Login → Get class → Start class → Admit (loop or admit-batch).
- **Student flow** (separate thread group): Login → Join class.

Adjust loop counts and thread counts to match 50 vs 100 attendees and 100 users.

## 5. Key HTTP Details

**Important:** All POST/PATCH requests that send a JSON body must include the header `Content-Type: application/json` so the server parses the body. The JMX includes Header Manager for this where needed.

| Action        | Method | Path                          | Body / Headers |
|---------------|--------|-------------------------------|-----------------|
| Login         | POST   | `/auth/login`                 | `Content-Type: application/json` + `{"email","password"}` |
| Get class     | GET    | `/classes/${classId}`        | `Authorization: Bearer <token>` |
| Start class   | PATCH  | `/classes/${classId}/start`  | `Authorization: Bearer <token>` |
| Join class    | POST   | `/classes/${classId}/join`   | `{"displayName":"..."}`, Bearer |
| Admit one     | POST   | `/classes/${classId}/admit`  | `{"studentId":"<userId>"}`, Bearer |
| Admit batch   | POST   | `/classes/${classId}/admit-batch` | `{"studentIds":["id1","id2",...]}`, Bearer |

Extract the JWT from the login response (e.g. `token` or `$.token`) and use it as `Authorization: Bearer ${token}` for all class and chat requests.

## 6. Analyzing results (results.jtl)

When you run JMeter in CLI mode with `-l results.jtl`, you get a CSV of every sample. Here’s how to use it.

### Columns in the JTL (typical)

| Column         | Meaning |
|----------------|--------|
| timeStamp      | Unix ms when the request ended |
| elapsed        | Response time in ms |
| label          | Sampler name (e.g. "Student Login", "Get Class") |
| responseCode   | HTTP status (200, 400, 401, etc.) |
| responseMessage| Short status text |
| success        | true/false |
| bytes          | Response body size (bytes) |
| URL            | Full request URL |

### Option A: JMeter HTML report (recommended)

Generate a report from the JTL. **The output folder must be empty or not exist** (JMeter will not overwrite an existing report folder):

```bash
cd jmeter
# Remove previous report so JMeter can write (Windows PowerShell)
if (Test-Path report) { Remove-Item -Recurse -Force report }
jmeter -g results.jtl -o report
```

Or use a new folder each time: `jmeter -g results.jtl -o report-$(Get-Date -Format 'yyyyMMdd-HHmm')` (PowerShell) or `report-$(date +%Y%m%d-%H%M)` (bash). Then open `report/index.html` in a browser. You get:

- Summary (count, error %, throughput, response time percentiles)
- Charts (response times over time, throughput, etc.)
- Breakdown by request label

### Option B: Summary script (this repo)

From project root:

```bash
node jmeter/scripts/analyze-jtl.js jmeter/results.jtl
```

Or from `jmeter/`:

```bash
node scripts/analyze-jtl.js results.jtl
```

This prints per-label: count, OK/fail, min/avg/max/p95/p99 response time (ms), and response code distribution.

### Option C: JMeter GUI

1. Open the same JMX.
2. Add a **View Results Tree** or **Summary Report** under the Test Plan.
3. In the listener, set **Filename** to your `results.jtl`.
4. Load the file: the listener will show tables and (for View Results Tree) request/response details.

### Option D: Spreadsheet or script

The JTL is CSV. Open it in Excel/Sheets or parse it with any script: group by `label`, then aggregate `elapsed`, `success`, and `responseCode` to get throughput, error rate, and percentiles.

## 7. What to Watch

- **Response times**: login, get class, start, admit (or admit-batch).
- **Throughput**: requests per second.
- **Errors**: 401/403/404/5xx.
- **Socket.IO**: number of concurrent connections and events per second (if using a plugin).
- **Server**: Node process and MongoDB (CPU, memory, connection count).

## 8. Limits

- **100 users × 50/100 attendees** is mainly **HTTP + optional Socket.IO** load; JMeter is suitable.
- **WebRTC media** (actual video/audio) cannot be simulated with JMeter; use browser-based tests or real users for that.
