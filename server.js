const path = require('path');
const http = require('http');
const mongoose = require('mongoose');
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
app.use(cors({
  origin: ["localhost:3000", "localhost:4000"],
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
  maxAge: 86400,
  preflightContinue: false,
  optionsSuccessStatus: 204,
  exposedHeaders: ["Content-Range", "X-Total-Count"],
}));
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
const healthRoutes = require('./app/routes/healthRoutes');

app.use('/health', healthRoutes);
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

// 403 Forbidden — explicit route for testing or redirects
app.get('/403', (req, res) => {
  res.status(403).json({ message: 'Forbidden', statusCode: 403, error: 'Forbidden' });
});

// 404 wildcard — must be after all registered routes
app.use((req, res, next) => {
  const err = new Error('Not found');
  err.statusCode = 404;
  err.url = req.originalUrl;
  err.method = req.method;
  next(err);
});

// Global error handler — prevents unhandled errors from shutting down the server
app.use((err, req, res, next) => {
  const statusCode = err.statusCode || err.status || 500;
  const message = err.message || 'Internal server error';
  logger.error('[HTTP Error]', statusCode, message, err.url ? `(${err.method} ${err.url})` : '', err.stack || err);
  if (res.headersSent) {
    return next(err);
  }
  res.status(statusCode).json({
    message: statusCode === 500 ? 'Internal server error' : message,
    ...(config.isDevelopment && statusCode === 500 ? { stack: err.stack } : {})
  });
});

// Socket IO & WebRTC
registerSocketHandlers(io);
webrtcSignaling(io);

// Graceful shutdown: log reason and time, then close server and DB
const shutdown = (reason, signalOrCode) => {
  const at = new Date().toISOString();
  logger.warn('[Shutdown]', reason, 'signalOrCode=', signalOrCode, 'at=', at);

  server.close((closeErr) => {
    if (closeErr) {
      logger.error('[Shutdown] Error closing HTTP server', closeErr);
    }
    if (mongoose.connection.readyState === 1) {
      mongoose.connection.close(false).then(
        () => {
          logger.info('[Shutdown] MongoDB connection closed');
          process.exit(signalOrCode === 'SIGTERM' || signalOrCode === 'SIGINT' ? 0 : 1);
        },
        (disconnectErr) => {
          logger.error('[Shutdown] MongoDB disconnect error', disconnectErr);
          process.exit(1);
        }
      );
    } else {
      process.exit(signalOrCode === 'SIGTERM' || signalOrCode === 'SIGINT' ? 0 : 1);
    }
  });

  setTimeout(() => {
    logger.error('[Shutdown] Forced exit after timeout');
    process.exit(1);
  }, 15000);
};

process.on('SIGTERM', () => shutdown('SIGTERM received', 'SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT received', 'SIGINT'));
process.on('uncaughtException', (err) => {
  logger.error('[uncaughtException]', err);
  shutdown('uncaughtException', 1);
});
process.on('unhandledRejection', (reason, promise) => {
  logger.error('[unhandledRejection]', reason, promise);
  shutdown('unhandledRejection', 1);
});

server.listen(config.PORT, () => {
  logger.info(`Server listening on port ${config.PORT}`);
});
