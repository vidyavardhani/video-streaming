const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
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

const activeRecordings = new Map();

const getTempPath = (classId) => {
  const fileName = `${classId}-${Date.now()}.mp4`;
  return path.join(os.tmpdir(), fileName);
};

const ensureFileExists = async (filePath) => {
  try {
    await fsp.access(filePath, fs.constants.F_OK);
  } catch (err) {
    await fsp.writeFile(filePath, Buffer.from('Mock recording placeholder'));
  }
};

const uploadToS3 = async (key, filePath) => {
  if (!s3Client) {
    return null;
  }
  const body = await fsp.readFile(filePath);
  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: 'video/mp4'
    })
  );
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
};

const ensureDirectory = async (dirPath) => {
  await fsp.mkdir(dirPath, { recursive: true });
};

const saveLocalRecording = async (key, sourcePath) => {
  const normalizedKey = key.replace(/\\/g, '/');
  const destinationPath = path.join(__dirname, '../public', normalizedKey);
  await ensureDirectory(path.dirname(destinationPath));
  await fsp.copyFile(sourcePath, destinationPath);
  return `/public/${normalizedKey}`;
};

const stopProcess = (proc) => new Promise((resolve) => {
  if (!proc) {
    resolve();
    return;
  }
  proc.once('exit', () => resolve());
  try {
    proc.kill('SIGINT');
  } catch (error) {
    resolve();
  }
});

const startRecording = async (klass) => {
  if (!klass) return;
  const classKey = klass._id.toString();
  if (activeRecordings.has(classKey)) {
    return;
  }

  const outputPath = getTempPath(classKey);
  let ffmpegProcess = null;
  const ffmpegInput = process.env.FFMPEG_INPUT || null;

  if (ffmpegInput) {
    const args = [
      '-y',
      '-i',
      ffmpegInput,
      '-c:v',
      'copy',
      outputPath
    ];
    ffmpegProcess = spawn('ffmpeg', args, { stdio: 'ignore' });
  } else {
    await fsp.writeFile(outputPath, Buffer.from('Simulated recording for class'));
  }

  activeRecordings.set(classKey, { outputPath, process: ffmpegProcess, paused: false });
  klass.recording = {
    isRecording: true,
    isPaused: false,
    startedAt: new Date(),
    pausedAt: null,
    fileKey: null
  };
  klass.recordedVideoLink = null;
  klass.recordingClassLink = null;
};

const stopRecording = async (klass) => {
  if (!klass) return null;
  const classKey = klass._id.toString();
  const recording = activeRecordings.get(classKey);
  if (!recording) {
    return null;
  }

  await stopProcess(recording.process);
  await ensureFileExists(recording.outputPath);

  const fileKey = `recordings/${klass.meetingCode}/${Date.now()}.mp4`;
  let s3Link = null;
  try {
    s3Link = await uploadToS3(fileKey, recording.outputPath);
  } catch (error) {
    console.error('Recording upload failed, falling back to local storage', error);
  }
  const finalLink = s3Link || (await saveLocalRecording(fileKey, recording.outputPath));
  await fsp.unlink(recording.outputPath).catch(() => {});
  activeRecordings.delete(classKey);

  klass.recording = {
    isRecording: false,
    isPaused: false,
    startedAt: klass.recording?.startedAt || null,
    pausedAt: null,
    fileKey
  };
  klass.recordedVideoLink = finalLink;
  klass.recordingClassLink = finalLink;
  return finalLink;
};

const pauseRecording = async (klass) => {
  if (!klass) return;
  const classKey = klass._id.toString();
  const recording = activeRecordings.get(classKey);
  if (!recording || recording.paused) {
    return;
  }
  recording.paused = true;
  if (recording.process && typeof recording.process.kill === 'function') {
    try {
      recording.process.kill('SIGSTOP');
    } catch (error) {
      /* ignore pause signalling issues */
    }
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
  const recording = activeRecordings.get(classKey);
  if (!recording || !recording.paused) {
    return;
  }
  recording.paused = false;
  if (recording.process && typeof recording.process.kill === 'function') {
    try {
      recording.process.kill('SIGCONT');
    } catch (error) {
      /* ignore resume signalling issues */
    }
  }
  klass.recording = {
    ...(klass.recording || {}),
    isRecording: true,
    isPaused: false,
    pausedAt: null
  };
};

module.exports = {
  startRecording,
  stopRecording,
  pauseRecording,
  resumeRecording
};
