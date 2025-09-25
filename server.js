const path = require('path');
const http = require('http');
const express = require('express');
const mongoose = require('mongoose');
const morgan = require('morgan');
const cors = require('cors');
const dotenv = require('dotenv');
const cookieParser = require('cookie-parser');
const swaggerUi = require('swagger-ui-express');
const docs = require('./docs/swagger');

const registerSocketHandlers = require('./app/sockets');

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = require('socket.io')(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

registerSocketHandlers(io);

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(morgan('dev'));

app.set('views', path.join(__dirname, 'app/views'));
app.set('view engine', 'ejs');
app.use('/public', express.static(path.join(__dirname, 'app/public')));

const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/video-streaming';
mongoose
  .connect(mongoUri)
  .then(() => console.log('Connected to MongoDB'))
  .catch((err) => console.error('MongoDB connection error:', err.message));

const authRoutes = require('./app/routes/authRoutes');
const classRoutes = require('./app/routes/classRoutes');
const chatRoutes = require('./app/routes/chatRoutes');
const dashboardRoutes = require('./app/routes/dashboardRoutes');
const { optional } = require('./app/middleware/auth');

app.use('/auth', authRoutes);
app.use('/classes', classRoutes);
app.use('/chat', chatRoutes);
app.use('/admin', dashboardRoutes);
app.use('/docs', swaggerUi.serve, swaggerUi.setup(docs));

app.get('/', optional, (req, res) => {
  if (req.user) {
    res.redirect('/dashboard');
    return;
  }
  res.render('login');
});

app.get('/register', (req, res) => {
  res.render('register');
});

app.get('/dashboard', optional, (req, res) => {
  if (!req.user || req.user.role !== 'teacher') {
    return res.redirect('/');
  }
  res.render('dashboard', { user: req.user });
});

app.get('/class/:code/end', (req, res) => {
  res.render('end');
});

app.get('/class/:code', (req, res) => {
  res.render('class', { classCode: req.params.code });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
