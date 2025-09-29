const fsp = require('fs/promises');
const path = require('path');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const region = process.env.AWS_REGION || 'us-east-1';
const bucket = process.env.AWS_S3_BUCKET_NAME;
const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

let s3Client = null;
if (bucket && accessKeyId && secretAccessKey) {
  s3Client = new S3Client({
    region,
    credentials: {
      accessKeyId,
      secretAccessKey
    }
  });
}

const activeRecordings = new Set();

const ensureDirectory = async (dirPath) => {
  await fsp.mkdir(dirPath, { recursive: true });
};

const normalizeMimeType = (mimeType) => {
  if (!mimeType || typeof mimeType !== 'string') return 'video/webm';
  return mimeType.trim().toLowerCase();
};

const determineExtension = (mimeType) => {
  const normalized = normalizeMimeType(mimeType);
  const mapping = {
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/x-matroska': 'mkv',
    'video/quicktime': 'mov',
    'video/ogg': 'ogg'
  };
  if (mapping[normalized]) {
    return mapping[normalized];
  }
  const guess = normalized.split('/')[1];
  return guess && guess.length < 8 ? guess : 'webm';
};

const uploadToS3 = async (key, buffer, mimeType) => {
  if (!s3Client) {
    return null;
  }
  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: normalizeMimeType(mimeType)
    })
  );
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
};

const saveLocalRecording = async (key, buffer) => {
  const normalizedKey = key.replace(/\\/g, '/');
  const destinationPath = path.join(__dirname, '../public', normalizedKey);
  await ensureDirectory(path.dirname(destinationPath));
  await fsp.writeFile(destinationPath, buffer);
  return `/public/${normalizedKey}`;
};

const buildFinalLink = async (key, buffer, mimeType) => {
  let persistedLink = null;
  try {
    persistedLink = await uploadToS3(key, buffer, mimeType);
  } catch (error) {
    console.error('Failed to upload recording to S3, falling back to local storage', error);
  }
  if (persistedLink) {
    return persistedLink;
  }
  return saveLocalRecording(key, buffer);
};

const startRecording = async (klass) => {
  if (!klass) return;
  const classKey = klass._id.toString();
  if (activeRecordings.has(classKey)) {
    return;
  }
  activeRecordings.add(classKey);
  const startedAt = new Date();
  klass.recording = {
    ...(klass.recording || {}),
    isRecording: true,
    isPaused: false,
    startedAt,
    pausedAt: null,
    finishedAt: null,
    fileKey: null,
    durationMs: null
  };
  klass.recordedVideoLink = null;
  klass.recordingClassLink = null;
};

const pauseRecording = async (klass) => {
  if (!klass) return;
  const classKey = klass._id.toString();
  if (!activeRecordings.has(classKey)) {
    return;
  }
  klass.recording = {
    ...(klass.recording || {}),
    isRecording: true,
    isPaused: true,
    pausedAt: new Date()
  };
};

const resumeRecording = async (klass) => {
  if (!klass) return;
  const classKey = klass._id.toString();
  if (!activeRecordings.has(classKey)) {
    return;
  }
  klass.recording = {
    ...(klass.recording || {}),
    isRecording: true,
    isPaused: false,
    pausedAt: null
  };
};

const stopRecording = async (klass, { buffer, mimeType, durationMs, allowPlaceholder = false } = {}) => {
  if (!klass) return null;
  const classKey = klass._id.toString();
  activeRecordings.delete(classKey);

  const normalizedMime = normalizeMimeType(mimeType);
  const providedBuffer = Buffer.isBuffer(buffer)
    ? buffer
    : buffer && typeof buffer === 'string'
      ? Buffer.from(buffer, 'base64')
      : null;

  if (!providedBuffer || providedBuffer.length === 0) {
    if (!allowPlaceholder) {
      throw new Error('Recording data missing');
    }
  }

  const finalBuffer = providedBuffer && providedBuffer.length
    ? providedBuffer
    : Buffer.from('Recording unavailable');

  const extension = determineExtension(normalizedMime);
  const fileKey = `recordings/${klass.meetingCode}/${Date.now()}.${extension}`;
  const link = await buildFinalLink(fileKey, finalBuffer, normalizedMime);

  const parsedDuration = Number(durationMs);

  klass.recording = {
    ...(klass.recording || {}),
    isRecording: false,
    isPaused: false,
    pausedAt: null,
    finishedAt: new Date(),
    durationMs: Number.isFinite(parsedDuration) ? parsedDuration : klass.recording?.durationMs || null,
    fileKey
  };
  klass.recordedVideoLink = link;
  klass.recordingClassLink = link;
  return link;
};

module.exports = {
  startRecording,
  stopRecording,
  pauseRecording,
  resumeRecording
};
