/**
 * Database seeder for development/demo.
 * Creates admin, teachers, students, sample classes, and chat messages.
 *
 * Usage (from project root):
 *   node scripts/seed-db.js
 *   npm run seed:db
 *
 * All users get password: password123
 * Uses config (MONGO_URI, etc.) from config/config.js
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const config = require('../config/config');
const { ROLE, CLASS_STATUS } = require('../config/constants');

const User = require('../app/models/User');
const Class = require('../app/models/Class');
const Chat = require('../app/models/Chat');

const DEFAULT_PASSWORD = 'password123';

const USERS = [
  { name: 'Admin', email: 'admin@example.com', role: ROLE.ADMIN },
  { name: 'Alice Teacher', email: 'alice@example.com', role: ROLE.TEACHER },
  { name: 'Bob Teacher', email: 'bob@example.com', role: ROLE.TEACHER },
  { name: 'Charlie Student', email: 'charlie@example.com', role: ROLE.STUDENT },
  { name: 'Diana Student', email: 'diana@example.com', role: ROLE.STUDENT },
  { name: 'Eve Student', email: 'eve@example.com', role: ROLE.STUDENT },
  { name: 'Frank Student', email: 'frank@example.com', role: ROLE.STUDENT },
  { name: 'Grace Student', email: 'grace@example.com', role: ROLE.STUDENT },
];

async function seed() {
  await mongoose.connect(config.MONGO_URI);

  const hashed = await bcrypt.hash(DEFAULT_PASSWORD, 10);
  const users = {};

  for (const u of USERS) {
    const existing = await User.findOne({ email: u.email });
    if (existing) {
      users[u.email] = existing;
      console.log(`  User exists: ${u.email}`);
    } else {
      const user = await User.create({
        name: u.name,
        email: u.email,
        password: hashed,
        role: u.role
      });
      users[u.email] = user;
      console.log(`  Created user: ${u.email} (${u.role})`);
    }
  }

  const alice = users['alice@example.com'];
  const bob = users['bob@example.com'];
  const charlie = users['charlie@example.com'];
  const diana = users['diana@example.com'];

  const generateMeetingCode = () => {
    const digits = Math.floor(100000000 + Math.random() * 900000000).toString();
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 9)}`;
  };

  const baseUrl = config.BASE_URL || 'http://localhost:4000';

  const classesToCreate = [
    { title: 'Introduction to WebRTC', host: alice._id, status: CLASS_STATUS.SCHEDULED },
    { title: 'Live Coding Session', host: alice._id, status: CLASS_STATUS.LIVE },
    { title: 'Node.js Basics', host: bob._id, status: CLASS_STATUS.SCHEDULED },
    { title: 'Past Class (Ended)', host: bob._id, status: CLASS_STATUS.ENDED }
  ];

  const createdClasses = [];
  for (const c of classesToCreate) {
    const existing = await Class.findOne({ title: c.title, host: c.host });
    if (existing) {
      createdClasses.push(existing);
      console.log(`  Class exists: ${c.title}`);
    } else {
      const meetingCode = generateMeetingCode();
      const klass = await Class.create({
        ...c,
        meetingCode,
        meetingLink: `${baseUrl}/class/PLACEHOLDER`
      });
      klass.meetingLink = `${baseUrl}/class/${klass._id}`;
      await klass.save();
      createdClasses.push(klass);
      console.log(`  Created class: ${c.title} (${c.status}) -> /class/${klass._id}`);
    }
  }

  const [scheduledClass, liveClass] = createdClasses;

  if (scheduledClass && charlie && diana) {
    const existingChat = await Chat.findOne({ class: scheduledClass._id });
    if (!existingChat) {
      await Chat.create([
        { class: scheduledClass._id, sender: alice._id, senderName: alice.name, message: 'Welcome! We will start in a few minutes.' },
        { class: scheduledClass._id, sender: charlie._id, senderName: charlie.name, message: 'Hi, ready when you are.' },
        { class: scheduledClass._id, sender: alice._id, senderName: alice.name, message: 'Great, see you soon.' }
      ]);
      console.log('  Created chat messages for scheduled class');
    }
  }

  if (liveClass && charlie) {
    const existingChat = await Chat.findOne({ class: liveClass._id });
    if (!existingChat) {
      await Chat.create([
        { class: liveClass._id, sender: alice._id, senderName: alice.name, message: 'Class is live. Ask questions in chat.' },
        { class: liveClass._id, sender: charlie._id, senderName: charlie.name, message: 'Got it, thanks!' }
      ]);
      console.log('  Created chat messages for live class');
    }
  }

  await mongoose.disconnect();
  console.log('\nSeed done. All user passwords: ' + DEFAULT_PASSWORD);
  console.log('Login examples: admin@example.com, alice@example.com, charlie@example.com');
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
