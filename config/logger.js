/**
 * Environment-aware logger.
 * - Development: Verbose, colored, human-readable
 * - Staging: Structured with timestamps, info+
 * - Production: JSON format for log aggregators, configurable levels
 */

const NODE_ENV = (process.env.NODE_ENV || 'development').toLowerCase();
const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const MIN_LEVEL = LOG_LEVELS[process.env.LOG_LEVEL || (NODE_ENV === 'production' ? 'warn' : 'debug')] ?? 0;

const COLORS = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  green: '\x1b[32m'
};

const formatTimestamp = () => new Date().toISOString();

const shouldLog = (level) => (LOG_LEVELS[level] ?? 0) >= MIN_LEVEL;

const formatMessage = (level, ...args) => {
  const ts = formatTimestamp();
  const msg = args.map((a) => (a instanceof Error ? a.stack || a.message : a)).join(' ');

  if (NODE_ENV === 'production') {
    const entry = {
      timestamp: ts,
      level,
      message: msg,
      env: NODE_ENV
    };
    if (args[0] instanceof Error) {
      entry.error = { name: args[0].name, message: args[0].message, stack: args[0].stack };
    }
    return JSON.stringify(entry);
  }

  if (NODE_ENV === 'staging') {
    return `[${ts}] [${level.toUpperCase()}] ${msg}`;
  }

  // Development: colored, human-readable
  const levelColors = { debug: COLORS.dim, info: COLORS.cyan, warn: COLORS.yellow, error: COLORS.red };
  const c = levelColors[level] || COLORS.reset;
  return `${COLORS.dim}${ts}${COLORS.reset} ${c}[${level.toUpperCase()}]${COLORS.reset} ${msg}`;
};

const log = (level, ...args) => {
  if (!shouldLog(level)) return;
  const formatted = formatMessage(level, ...args);
  const output = level === 'error' ? process.stderr : process.stdout;
  output.write(formatted + '\n');
};

const ALWAYS_MASK = ['JWT_SECRET', 'TURN_SECRET'];
const MASK_IN_PROD = ['MONGO_URI'];

const maskValue = (key, value) => {
  if (value == null || value === '') return '(not set)';
  if (ALWAYS_MASK.includes(key)) return '****';
  if (MASK_IN_PROD.includes(key) && NODE_ENV !== 'development') return '****';
  return String(value);
};

const logEnvConfig = (config) => {
  const entries = Object.entries(config)
    .filter(([k]) => !['isDevelopment', 'isStaging', 'isProduction'].includes(k))
    .map(([k, v]) => `${k}=${maskValue(k, v)}`);

  const env = NODE_ENV.toUpperCase();
  const lines = [`Environment: ${env}`, ...entries.map((e) => `  ${e}`)];

  const ts = formatTimestamp();
  lines.forEach((line) => {
    let formatted;
    if (NODE_ENV === 'production') {
      formatted = JSON.stringify({ timestamp: ts, level: 'info', message: line, env: NODE_ENV });
    } else if (NODE_ENV === 'staging') {
      formatted = `[${ts}] [INFO] ${line}`;
    } else {
      formatted = `${COLORS.dim}${ts}${COLORS.reset} ${COLORS.yellow}[ENV]${COLORS.reset} ${COLORS.yellow}${line}${COLORS.reset}`;
    }
    process.stdout.write(formatted + '\n');
  });
};

const logger = {
  debug: (...args) => log('debug', ...args),
  info: (...args) => log('info', ...args),
  warn: (...args) => log('warn', ...args),
  error: (...args) => log('error', ...args),
  logEnvConfig
};

module.exports = logger;
