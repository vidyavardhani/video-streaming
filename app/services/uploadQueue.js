const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const fsp = require('fs/promises');
const path = require('path');

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

// Upload to S3
const uploadToS3 = async (key, buffer, mimeType) => {
  if (!s3Client) {
    throw new Error('S3 client not configured');
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

  console.log(`Upload job queued for class ${meetingCode} (${classId})`);

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
      console.log(`Processing upload job for class ${job.meetingCode} (attempt ${job.attempts + 1}/${job.maxAttempts})`);
      
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
        console.log(`Successfully uploaded to S3: ${uploadUrl}`);
      } catch (s3Error) {
        console.error('S3 upload failed, falling back to local storage:', s3Error);
        uploadError = s3Error;
        
        // Fallback to local storage
        try {
          uploadUrl = await saveLocalRecording(job.fileKey, job.buffer);
          console.log(`Saved to local storage: ${uploadUrl}`);
        } catch (localError) {
          console.error('Local storage also failed:', localError);
          throw localError;
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

      console.log(`Upload job completed for class ${job.meetingCode}`);

      // Update the class model
      await updateClassWithUploadResult(job);

    } catch (error) {
      console.error(`Upload job failed for class ${job.meetingCode}:`, error);
      
      job.error = error.message;

      // Retry if attempts remain
      if (job.attempts < job.maxAttempts) {
        console.log(`Retrying upload for class ${job.meetingCode} (attempt ${job.attempts + 1}/${job.maxAttempts})`);
        uploadQueue.push(job);
        
        if (io) {
          io.to(job.meetingCode).emit('upload:status', {
            status: UploadStatus.QUEUED,
            message: `Upload failed, retrying... (attempt ${job.attempts}/${job.maxAttempts})`,
            error: error.message
          });
        }
      } else {
        // Mark as failed after max attempts
        job.status = UploadStatus.FAILED;
        job.failedAt = new Date();

        if (io) {
          io.to(job.meetingCode).emit('upload:status', {
            status: UploadStatus.FAILED,
            message: 'Video upload failed after multiple attempts',
            error: error.message
          });
        }

        // Update class model with failure
        await updateClassWithUploadResult(job);
      }
    }

    // Small delay between jobs
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
      console.error(`Class not found for upload job: ${job.classId}`);
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
    console.log(`Class ${job.meetingCode} updated with upload result`);

    // Remove from active uploads
    activeUploads.delete(job.classId);

  } catch (error) {
    console.error('Error updating class with upload result:', error);
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

