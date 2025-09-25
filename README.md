# Live Class Platform

This project delivers a Google Meet–style experience for teachers and students using Node.js, Express, MongoDB, Socket.IO, and WebRTC. Teachers can create and manage classes from the browser, while students join via meeting links or codes for real-time audio, video, and chat.

## Features

- JWT authentication with secure cookies and automatic client storage.
- Teacher dashboard for creating, starting, ending, and opening classes.
- Lobby workflow so students request admission before entering the live session.
- Live WebRTC broadcasting so the host’s camera/screen share streams to admitted students.
- In-call chat with Socket.IO updates and MongoDB persistence.
- Swagger docs at `/docs` summarising the REST API surface.
- Full-screen meeting stage with host-only broadcast, floating PiP, and slide-in drawers for chat and participants.

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
   BASE_URL=http://64.227.152.29:5000
   ```

3. **Run the development server**
   ```bash
   npm run dev
   ```

4. **Open the app**
   - Visit `http://64.227.152.29:5000` to register or log in.
   - Teachers land on the dashboard to create classes.
   - Share the class link or code with students (`/class/:id`). Students only need their name to request access.
   - The host admits students from the lobby drawer and, once live, their camera or shared screen is broadcast to everyone.

## Usage Walkthrough

1. **Teacher dashboard**
   - Create a class to generate a human-friendly meeting code (e.g. `123-456-789`) and share the link with attendees.
   - Start the class when you are ready to go live. The live view exposes mic, camera, screen-share, recording, and class tools.

2. **Student join flow**
   - Navigate to the invite link, enter a display name, and request to join. No account is required.
   - After admission, the session connects automatically. Students see only the teacher’s video or shared screen in the full-screen stage.

3. **During the class**
   - Toggle chat or participants using the header icons. Drawers slide in without disrupting the video stage and can be dismissed with a click or Escape.
   - Screen sharing, camera toggles, and host controls instantly synchronise to all connected students via Socket.IO signalling.
   - If a student disconnects, reconnecting with the same meeting code re-enters them in real time without a manual refresh for anyone.

4. **Wrapping up**
   - The host can end the session, which tears down all WebRTC peers and routes everyone to the end screen with a return-to-dashboard button.

## Tech Stack

- **Backend:** Node.js, Express, MongoDB, Mongoose
- **Realtime:** Socket.IO + WebRTC (peer-to-peer fan-out from host)
- **Frontend:** EJS templates, Vanilla JS, modern CSS
- **Auth:** JWT (stored in HTTP-only cookie and localStorage for sockets)

## Testing

Use the swagger documentation at `/docs` or Postman to exercise the API. Ensure MongoDB is running locally before starting the server.
