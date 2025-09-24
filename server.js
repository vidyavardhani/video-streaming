const path = require('path');
const http = require('http');
const express = require('express');
const mongoose = require('mongoose');
const morgan = require('morgan');
const cors = require('cors');
const dotenv = require('dotenv');
const swaggerUi = require('swagger-ui-express');
const docs = require('./docs/swagger');

const registerSocketHandlers = require('./app/sockets');
const webrtcSignaling = require('./app/webrtc');

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = require('socket.io')(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Static assets & views
app.set('views', path.join(__dirname, 'app/views'));
app.set('view engine', 'ejs');
app.use('/public', express.static(path.join(__dirname, 'app/public')));

// Database connection
const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/video-streaming';
mongoose.connect(mongoUri, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('Connected to MongoDB');
}).catch((err) => {
  console.error('MongoDB connection error:', err.message);
});

// Routes
const authRoutes = require('./app/routes/authRoutes');
const classRoutes = require('./app/routes/classRoutes');
const chatRoutes = require('./app/routes/chatRoutes');
const dashboardRoutes = require('./app/routes/dashboardRoutes');

app.use('/auth', authRoutes);
app.use('/classes', classRoutes);
app.use('/chat', chatRoutes);
app.use('/', dashboardRoutes);
app.use('/docs', swaggerUi.serve, swaggerUi.setup(docs));

app.get('/', (req, res) => {
  res.json({
    message: 'Video streaming API is running'
  });
});

app.get('/class/:id', (req, res) => {
  res.render('class', { classId: req.params.id });
});

app.get('/class/:id/end', (req, res) => {
  res.render('end');
});

// Socket IO & WebRTC
registerSocketHandlers(io);
webrtcSignaling(io);

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
