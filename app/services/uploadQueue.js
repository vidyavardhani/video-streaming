const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const fsp = require('fs/promises');
const path = require('path');
const dotenv = require('dotenv');
dotenv.config();

const region = process.env.AWS_REGION || 'ap-southeast-2';
const bucket = process.env.AWS_S3_BUCKET_NAME;
const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

const hasAwsConfig = !!(bucket && accessKeyId && secretAccessKey);

let s3Client = null;
if (hasAwsConfig) {
  s3Client = new S3Client({
    region,
    credentials: {
      accessKeyId,
      secretAccessKey
    },
    maxAttempts: 3
  });
}

// In-memory queue for upload jobs
const uploadQueue = [];
const activeUploads = new Map();
let isProcessing = false;
let io = null; // Socket.io instance for progress updates

// Set Socket.IO instance
const setSocketIO = (socketIO) => {
  io = socketIO;
};

// Upload status constants
const UploadStatus = {
  QUEUED: 'queued',
  UPLOADING: 'uploading',
  COMPLETED: 'completed',
  FAILED: 'failed'
};

// Helper to ensure directory exists
const ensureDirectory = async (dirPath) => {
  await fsp.mkdir(dirPath, { recursive: true });
};

// Normalize MIME type
const normalizeMimeType = (mimeType) => {
  if (!mimeType || typeof mimeType !== 'string') return 'video/webm';
  return mimeType.trim().toLowerCase();
};

const uploadToS3 = async (key, buffer, mimeType) => {
  if (!s3Client) {
    throw new Error('S3 client not configured. Please set AWS_S3_BUCKET_NAME, AWS_ACCESS_KEY_ID, and AWS_SECRET_ACCESS_KEY environment variables.');
  }

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: buffer,
    ContentType: normalizeMimeType(mimeType),
    Metadata: {
      uploadedAt: new Date().toISOString(),
      fileSize: buffer.length.toString()
    }
  });

  const uploadPromise = s3Client.send(command);
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Upload timeout after 5 minutes')), 300000);
  });

  await Promise.race([uploadPromise, timeoutPromise]);

  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
};

// Save to local storage as fallback
const saveLocalRecording = async (key, buffer) => {
  const normalizedKey = key.replace(/\\/g, '/');
  const destinationPath = path.join(__dirname, '../public', normalizedKey);
  await ensureDirectory(path.dirname(destinationPath));
  await fsp.writeFile(destinationPath, buffer);
  return `/public/${normalizedKey}`;
};

// Add upload job to queue
const queueUpload = async (jobData) => {
  const {
    classId,
    meetingCode,
    fileKey,
    buffer,
    mimeType,
    durationMs
  } = jobData;

  const job = {
    id: `${classId}_${Date.now()}`,
    classId,
    meetingCode,
    fileKey,
    buffer,
    mimeType,
    durationMs,
    status: UploadStatus.QUEUED,
    queuedAt: new Date(),
    attempts: 0,
    maxAttempts: 3,
    error: null
  };

  uploadQueue.push(job);
  activeUploads.set(classId, job);

  // Emit status update
  if (io) {
    io.to(meetingCode).emit('upload:status', {
      status: UploadStatus.QUEUED,
      message: 'Video upload queued'
    });
  }

  // Start processing if not already running
  if (!isProcessing) {
    processQueue();
  }

  return job;
};

// Process the upload queue
const processQueue = async () => {
  if (isProcessing || uploadQueue.length === 0) {
    return;
  }

  isProcessing = true;

  while (uploadQueue.length > 0) {
    const job = uploadQueue.shift();
    
    try {
      job.status = UploadStatus.UPLOADING;
      job.attempts += 1;
      job.uploadStartedAt = new Date();

      // Emit uploading status
      if (io) {
        io.to(job.meetingCode).emit('upload:status', {
          status: UploadStatus.UPLOADING,
          message: 'Uploading video to server...',
          progress: 0
        });
      }

      // Try uploading to S3
      let uploadUrl = null;
      let uploadError = null;

      try {
        uploadUrl = await uploadToS3(job.fileKey, job.buffer, job.mimeType);
      } catch (s3Error) {
        uploadError = s3Error;
        
        const isConfigError = s3Error.message.includes('not configured') || 
                             s3Error.message.includes('credentials') ||
                             s3Error.message.includes('InvalidAccessKeyId');
        
        if (isConfigError || job.attempts >= job.maxAttempts) {
          try {
            uploadUrl = await saveLocalRecording(job.fileKey, job.buffer);
          } catch (localError) {
            throw localError;
          }
        } else {
          throw s3Error;
        }
      }

      // Update job status
      job.status = UploadStatus.COMPLETED;
      job.completedAt = new Date();
      job.uploadUrl = uploadUrl;

      // Emit completion status
      if (io) {
        io.to(job.meetingCode).emit('upload:status', {
          status: UploadStatus.COMPLETED,
          message: 'Video uploaded successfully',
          uploadUrl,
          durationMs: job.durationMs
        });

        // Also emit recording status update
        io.to(job.meetingCode).emit('recording:uploaded', {
          recordedVideoLink: uploadUrl,
          recordingClassLink: uploadUrl
        });
      }

      // Update the class model
      await updateClassWithUploadResult(job);

    } catch (error) {
      const errorMessage = error.message || 'Unknown error';
      const errorCode = error.Code || error.code || 'UNKNOWN';
      
      job.error = errorMessage;
      job.errorCode = errorCode;

      if (job.attempts < job.maxAttempts) {
        const retryDelay = Math.min(1000 * Math.pow(2, job.attempts - 1), 10000);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        
        uploadQueue.push(job);
        
        if (io) {
          io.to(job.meetingCode).emit('upload:status', {
            status: UploadStatus.QUEUED,
            message: `Upload failed, retrying... (attempt ${job.attempts}/${job.maxAttempts})`,
            error: errorMessage
          });
        }
      } else {
        job.status = UploadStatus.FAILED;
        job.failedAt = new Date();

        if (io) {
          io.to(job.meetingCode).emit('upload:status', {
            status: UploadStatus.FAILED,
            message: 'Video upload failed after multiple attempts',
            error: errorMessage
          });
        }

        await updateClassWithUploadResult(job);
      }
    } finally {
      // Ensure isProcessing is reset even if there's an unexpected error
      if (uploadQueue.length === 0) {
        isProcessing = false;
      }
    }

    await new Promise(resolve => setTimeout(resolve, 100));
  }

  isProcessing = false;
};

// Update class model with upload result
const updateClassWithUploadResult = async (job) => {
  try {
    const Class = require('../models/Class');
    const klass = await Class.findById(job.classId);
    
    if (!klass) {
      return;
    }

    if (job.status === UploadStatus.COMPLETED) {
      klass.recordedVideoLink = job.uploadUrl;
      klass.recordingClassLink = job.uploadUrl;
      
      if (klass.recording) {
        klass.recording.uploadStatus = UploadStatus.COMPLETED;
        klass.recording.uploadedAt = job.completedAt;
      }
    } else if (job.status === UploadStatus.FAILED) {
      if (klass.recording) {
        klass.recording.uploadStatus = UploadStatus.FAILED;
        klass.recording.uploadError = job.error;
      }
    }

    await klass.save();

    // Remove from active uploads
    activeUploads.delete(job.classId);

  } catch (error) {
    // Silent error handling
  }
};

// Get upload status for a class
const getUploadStatus = (classId) => {
  return activeUploads.get(classId) || null;
};

// Get queue statistics
const getQueueStats = () => {
  return {
    queueLength: uploadQueue.length,
    activeUploads: activeUploads.size,
    isProcessing
  };
};

module.exports = {
  queueUpload,
  getUploadStatus,
  getQueueStats,
  setSocketIO,
  UploadStatus
};

