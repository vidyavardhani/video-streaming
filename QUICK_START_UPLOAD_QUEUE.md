# Quick Start: Video Upload Queue

## What Changed?

Video uploads are now **non-blocking** and processed in a **background queue**.

## Before vs After

### Before ❌
```javascript
// User stops recording
→ Upload to S3 (blocks for 5-30 seconds)
→ User waits... ⏳
→ Response with video URL
```

### After ✅
```javascript
// User stops recording
→ Queue upload (instant response)
→ User continues using app
→ Background upload to S3
→ Real-time status updates via Socket.IO
```

## Quick Test

1. **Start the server**
   ```bash
   npm start
   ```

2. **Create a meeting**
   - Login as teacher
   - Create a new class
   - Join the meeting

3. **Test recording**
   - Click "Start Recording"
   - Wait a few seconds
   - Click "Stop Recording"

4. **Observe the status changes**
   ```
   "Video upload queued..."          (instant)
   ↓
   "Uploading video to server..."    (background)
   ↓
   "Video uploaded successfully"     (complete)
   ```

## Visual Indicators

| Status | Icon | Color | Animation |
|--------|------|-------|-----------|
| Recording | 🔴 | Red | Pulsing dot |
| Queued | ⬆ | Blue | Pulsing |
| Uploading | ⬆ | Blue | Bouncing |
| Completed | ✓ | Green | None |
| Failed | ✗ | Red | None |

## API Changes

### Endpoint: `POST /classes/:code/recording/stop`

**Old Response:**
```json
{
  "recordedVideoLink": "https://s3.amazonaws.com/...",
  "recording": { "isRecording": false }
}
```

**New Response:**
```json
{
  "uploadStatus": "queued",
  "message": "Video upload queued",
  "recordedVideoLink": null,
  "recording": {
    "isRecording": false,
    "uploadStatus": "queued"
  }
}
```

**Note:** Video URL arrives via Socket.IO when upload completes.

## Socket Events

### Listen for these events on the client:

```javascript
socket.on('upload:status', (payload) => {
  console.log(payload.status)     // 'queued' | 'uploading' | 'completed' | 'failed'
  console.log(payload.message)    // Status message
  console.log(payload.uploadUrl)  // Available on 'completed'
})

socket.on('recording:uploaded', (payload) => {
  console.log(payload.recordedVideoLink)  // Final video URL
})
```

## Environment Setup

Required environment variables in `.env`:

```bash
# AWS S3 Configuration
AWS_REGION=us-east-1
AWS_S3_BUCKET_NAME=your-bucket-name
AWS_ACCESS_KEY_ID=your-access-key-id
AWS_SECRET_ACCESS_KEY=your-secret-access-key
```

## Troubleshooting

### Video stuck in "queued"
→ Check server console logs
→ Verify AWS credentials

### "Upload failed" message
→ Check S3 bucket permissions
→ Video will fallback to local storage automatically

### Status not updating
→ Check Socket.IO connection
→ Refresh the page

## Key Files

| File | Purpose |
|------|---------|
| `app/services/uploadQueue.js` | Queue service (new) |
| `app/services/recordingService.js` | Recording logic (modified) |
| `app/models/Class.js` | Database schema (updated) |
| `app/public/js/class.js` | Frontend logic (updated) |
| `app/public/css/style.css` | Styling (updated) |

## Queue Statistics (Dev Tool)

Check queue status in Node.js console:

```javascript
const { getQueueStats } = require('./app/services/uploadQueue')

console.log(getQueueStats())
// {
//   queueLength: 2,        // Jobs waiting
//   activeUploads: 1,      // Currently uploading  
//   isProcessing: true     // Processor active
// }
```

## Common Use Cases

### 1. Get Upload Status for a Class
```javascript
const { getUploadStatus } = require('./app/services/uploadQueue')

const status = getUploadStatus(classId)
if (status) {
  console.log(status.status)      // Current status
  console.log(status.attempts)    // Retry attempts
  console.log(status.error)       // Error message if failed
}
```

### 2. Monitor Upload Progress (Frontend)
```javascript
let uploadStatus = null

socket.on('upload:status', (payload) => {
  uploadStatus = payload.status
  
  if (payload.status === 'completed') {
    console.log('✅ Upload complete:', payload.uploadUrl)
  } else if (payload.status === 'failed') {
    console.error('❌ Upload failed:', payload.error)
  }
})
```

### 3. Handle Upload Failures
```javascript
socket.on('upload:status', (payload) => {
  if (payload.status === 'failed') {
    // Notify user
    alert('Video upload failed. The video is saved locally.')
    
    // Log error
    console.error('Upload error:', payload.error)
    
    // Optionally retry manually
    // (not implemented yet - future enhancement)
  }
})
```

## Performance Tips

1. **Video Compression**: Compress videos before upload to reduce size
2. **Network**: Ensure stable internet connection for faster uploads
3. **S3 Region**: Use S3 region closest to your server
4. **Transfer Acceleration**: Enable S3 transfer acceleration for large files

## Production Checklist

- [ ] AWS credentials configured
- [ ] S3 bucket exists and is accessible
- [ ] Bucket permissions set correctly
- [ ] Socket.IO enabled and working
- [ ] Tested recording and upload flow
- [ ] Error handling verified
- [ ] Local storage fallback tested
- [ ] Real-time updates working

## Next Steps

1. Read `UPLOAD_QUEUE_DOCUMENTATION.md` for detailed documentation
2. Read `UPLOAD_QUEUE_IMPLEMENTATION.md` for implementation details
3. Test the upload flow in your development environment
4. Monitor server logs during testing
5. Verify S3 uploads in AWS console

## Need Help?

- **Detailed Docs**: See `UPLOAD_QUEUE_DOCUMENTATION.md`
- **Implementation**: See `UPLOAD_QUEUE_IMPLEMENTATION.md`
- **Server Logs**: Check console for upload progress
- **Browser Console**: Check for Socket.IO errors

