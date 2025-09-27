const http = require('http');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const swaggerUi = require('swagger-ui-express');
const dotenv = require('dotenv');

const swaggerDocument = require('./docs/swagger');
const registerSockets = require('./src/socket');

const authRoutes = require('./src/routes/authRoutes');
const chatRoutes = require('./src/routes/chatRoutes');
const ticketRoutes = require('./src/routes/ticketRoutes');
const callRoutes = require('./src/routes/callRoutes');
const settingsRoutes = require('./src/routes/settingsRoutes');
const analyticsRoutes = require('./src/routes/analyticsRoutes');

dotenv.config();

const app = express();
const server = http.createServer(app);

const io = require('socket.io')(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
  }
});

registerSockets(io);

app.set('io', io);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(morgan('dev'));

const mongoUri =
  process.env.MONGO_URI || 'mongodb://localhost:27017/kalporg-support';

mongoose
  .connect(mongoUri)
  .then(() => console.log('Connected to MongoDB'))
  .catch((err) => console.error('MongoDB connection error:', err.message));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

app.use('/auth', authRoutes);
app.use('/chat', chatRoutes);
app.use('/ticket', ticketRoutes);
app.use('/call', callRoutes);
app.use('/settings', settingsRoutes);
app.use('/analytics', analyticsRoutes);
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Support platform running on port ${PORT}`);
});
