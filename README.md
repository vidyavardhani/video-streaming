# Live Class Platform

This project delivers a Google Meet–style experience for teachers and students using Node.js, Express, MongoDB, Socket.IO, and WebRTC. Teachers can create and manage classes from the browser, while students join via meeting links or codes for real-time audio, video, and chat.

## Features

- JWT authentication with secure cookies and automatic client storage.
- Teacher dashboard for creating, starting, ending, and opening classes.
- Lobby workflow so students request admission before entering the live session.
- Live WebRTC broadcasting so the host’s camera/screen share streams to admitted students.
- In-call chat with Socket.IO updates and MongoDB persistence.
- Swagger docs at `/docs` summarising the REST API surface.

## Getting Started

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Configure environment**
   Create a `.env` file (or set environment variables) with:
   ```env
   MONGO_URI=mongodb://127.0.0.1:27017/video-streaming
   JWT_SECRET=super-secret-key
   BASE_URL=http://localhost:4000
   ```

3. **Run the development server**
   ```bash
   npm run dev
   ```

4. **Open the app**
   - Visit `http://localhost:4000` to register or log in.
   - Teachers land on the dashboard to create classes.
   - Share the class link or code with students (`/class/:id`). Students only need their name to request access.

## Tech Stack

- **Backend:** Node.js, Express, MongoDB, Mongoose
- **Realtime:** Socket.IO + WebRTC (peer-to-peer fan-out from host)
- **Frontend:** EJS templates, Vanilla JS, modern CSS
- **Auth:** JWT (stored in HTTP-only cookie and localStorage for sockets)

## Testing

Use the swagger documentation at `/docs` or Postman to exercise the API. Ensure MongoDB is running locally before starting the server.
