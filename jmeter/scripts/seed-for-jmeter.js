/**
 * Seed script for JMeter load test.
 * Creates teachers, classes, and students and writes CSV files to jmeter/data/.
 *
 * Usage (from project root): node jmeter/scripts/seed-for-jmeter.js
 *
 * Requires: MongoDB running, env loaded (dotenv). Set BASE_URL if app is not at http://localhost:4000.
 */

const fs = require('fs');
const path = require('path');
const config = require('../../config/config');
const logger = require('../../config/logger');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const MONGODB_URI = config.MONGO_URI;
const NUM_CLASSES = config.JMETER_NUM_CLASSES;
const STUDENTS_PER_CLASS = config.JMETER_STUDENTS_PER_CLASS;

const User = require('../../app/models/User');
const Class = require('../../app/models/Class');

const DATA_DIR = path.join(__dirname, '..', 'data');

async function run() {
  await mongoose.connect(MONGODB_URI);
  const hashed = await bcrypt.hash('password123', 10);

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const teachers = [];
  const classes = [];
  const students = [];

  for (let i = 0; i < NUM_CLASSES; i++) {
    const email = `teacher_jmeter_${i}@test.com`;
    let user = await User.findOne({ email });
    if (!user) {
      user = await User.create({
        name: `Teacher ${i}`,
        email,
        password: hashed,
        role: 'teacher'
      });
    }
    let klass = await Class.findOne({ host: user._id, title: `JMeter Class ${i}` });
    if (!klass) {
      const meetingCode = `${100 + i}-${200 + i}-${300 + i}`;
      klass = await Class.create({
        title: `JMeter Class ${i}`,
        host: user._id,
        meetingCode
      });
    }
    teachers.push({ email, password: 'password123', classId: klass._id.toString() });
    classes.push(klass._id.toString());
  }

  let globalStudentIndex = 0;
  for (let c = 0; c < NUM_CLASSES; c++) {
    const classId = classes[c];
    for (let s = 0; s < STUDENTS_PER_CLASS; s++) {
      const email = `student_jmeter_${globalStudentIndex}@test.com`;
      let user = await User.findOne({ email });
      if (!user) {
        user = await User.create({
          name: `Student ${globalStudentIndex}`,
          email,
          password: hashed,
          role: 'student'
        });
      }
      students.push({
        email,
        password: 'password123',
        classId,
        userId: user._id.toString()
      });
      globalStudentIndex++;
    }
  }

  const teachersCsv = ['email,password,classId', ...teachers.map((t) => `${t.email},${t.password},${t.classId}`)].join('\n');
  const studentsCsv = [
    'email,password,classId,userId',
    ...students.map((s) => `${s.email},${s.password},${s.classId},${s.userId}`)
  ].join('\n');
  const classesCsv = ['classId', ...classes].join('\n');

  fs.writeFileSync(path.join(DATA_DIR, 'teachers.csv'), teachersCsv, 'utf8');
  fs.writeFileSync(path.join(DATA_DIR, 'students.csv'), studentsCsv, 'utf8');
  fs.writeFileSync(path.join(DATA_DIR, 'classes.csv'), classesCsv, 'utf8');

  logger.info(`Created ${teachers.length} teachers, ${classes.length} classes, ${students.length} students.`);
  logger.info(`Wrote jmeter/data/teachers.csv, students.csv, classes.csv`);
  await mongoose.disconnect();
}

run().catch((err) => {
  logger.error(err);
  process.exit(1);
});
