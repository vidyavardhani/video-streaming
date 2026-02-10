const path = require('path');
const http = require('http');
const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const docs = require('./docs/swagger');

const config = require('./config/config');
const logger = require('./config/logger');
const { connectDB } = require('./config/db');
const registerSocketHandlers = require('./app/sockets');
const webrtcSignaling = require('./app/webrtc');

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

// Log resolved env config at startup
logger.logEnvConfig(config);

// Database connection
connectDB();

// Routes
const authRoutes = require('./app/routes/authRoutes');
const classRoutes = require('./app/routes/classRoutes');
const chatRoutes = require('./app/routes/chatRoutes');
const dashboardRoutes = require('./app/routes/dashboardRoutes');
const webrtcRoutes = require('./app/routes/webrtcRoutes');

app.use('/auth', authRoutes);
app.use('/classes', classRoutes);
app.use('/chat', chatRoutes);
app.use('/api/webrtc', webrtcRoutes);
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

server.listen(config.PORT, () => {
  logger.info(`Server listening on port ${config.PORT}`);
});
