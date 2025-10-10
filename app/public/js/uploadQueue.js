// Persistent Upload Queue using IndexedDB
// Videos are saved locally and uploaded in background automatically

class PersistentUploadQueue {
  constructor() {
    this.dbName = 'VideoUploadQueue';
    this.storeName = 'pendingUploads';
    this.db = null;
    this.isProcessing = false;
    this.onStatusChange = null; // Callback for UI updates
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        console.log('📦 IndexedDB initialized for persistent uploads');
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'id' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('status', 'status', { unique: false });
          console.log('📦 IndexedDB store created');
        }
      };
    });
  }

  async saveVideo(videoData) {
    if (!this.db) await this.init();

    const upload = {
      id: `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      blob: videoData.blob,
      fileName: videoData.fileName,
      mimeType: videoData.mimeType,
      durationMs: videoData.durationMs,
      size: videoData.size,
      classCode: videoData.classCode,
      timestamp: Date.now(),
      status: 'pending',
      attempts: 0,
      maxAttempts: 999, // Unlimited attempts
      lastAttempt: null,
      error: null
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.add(upload);

      request.onsuccess = () => {
        console.log(`💾 Video saved to IndexedDB: ${upload.id} (${upload.fileName})`);
        this.notifyStatusChange();
        resolve(upload.id);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async getPendingUploads() {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const index = store.index('status');
      const request = index.getAll('pending');

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async getAllUploads() {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async updateUploadStatus(id, status, error = null) {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const getRequest = store.get(id);

      getRequest.onsuccess = () => {
        const upload = getRequest.result;
        if (upload) {
          upload.status = status;
          upload.lastAttempt = Date.now();
          upload.attempts += 1;
          if (error) upload.error = error;

          const updateRequest = store.put(upload);
          updateRequest.onsuccess = () => {
            this.notifyStatusChange();
            resolve();
          };
          updateRequest.onerror = () => reject(updateRequest.error);
        } else {
          resolve();
        }
      };
      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  async deleteUpload(id) {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.delete(id);

      request.onsuccess = () => {
        console.log(`🗑️ Deleted upload: ${id}`);
        this.notifyStatusChange();
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }

  async processQueue(performUpload) {
    if (this.isProcessing) {
      console.log('⏳ Queue already processing...');
      return;
    }

    this.isProcessing = true;
    console.log('🚀 Starting background upload processing...');

    try {
      const pending = await this.getPendingUploads();
      
      if (pending.length === 0) {
        console.log('✅ No pending uploads');
        this.isProcessing = false;
        return;
      }

      console.log(`📋 Found ${pending.length} pending upload(s)`);

      for (const upload of pending) {
        try {
          // Exponential backoff based on attempts
          const backoffDelay = Math.min(
            1000 * Math.pow(2, Math.min(upload.attempts, 10)),
            60000 // Max 60 seconds
          );

          // If last attempt was recent, skip for now
          if (upload.lastAttempt && (Date.now() - upload.lastAttempt) < backoffDelay) {
            console.log(`⏰ Skipping ${upload.id} - backoff delay (${backoffDelay}ms remaining)`);
            continue;
          }

          console.log(`⬆️ Uploading: ${upload.fileName} (attempt ${upload.attempts + 1})`);
          
          // Perform the upload using the callback function
          const result = await performUpload(upload);

          if (result && result.success) {
            console.log(`✅ Upload successful: ${upload.fileName}`);
            await this.deleteUpload(upload.id);
          } else {
            throw new Error(result?.error || 'Upload failed');
          }

        } catch (error) {
          console.error(`❌ Upload failed for ${upload.fileName}:`, error);
          await this.updateUploadStatus(upload.id, 'pending', error.message);
        }

        // Small delay between uploads
        await new Promise(resolve => setTimeout(resolve, 500));
      }

    } catch (error) {
      console.error('Queue processing error:', error);
    } finally {
      this.isProcessing = false;
      
      // Check if there are still pending uploads
      const remaining = await this.getPendingUploads();
      if (remaining.length > 0) {
        console.log(`🔄 ${remaining.length} upload(s) still pending, will retry later`);
        // Schedule next check in 10 seconds
        setTimeout(() => this.processQueue(performUpload), 10000);
      } else {
        console.log('🎉 All uploads completed!');
      }
    }
  }

  async startAutoUpload(performUpload) {
    // Process queue immediately
    await this.processQueue(performUpload);

    // Set up periodic checking every 30 seconds
    setInterval(() => {
      this.processQueue(performUpload);
    }, 30000);
  }

  notifyStatusChange() {
    if (this.onStatusChange) {
      this.getPendingCount().then(count => {
        this.onStatusChange(count);
      });
    }
  }

  async getPendingCount() {
    const pending = await this.getPendingUploads();
    return pending.length;
  }

  async clearAll() {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.clear();

      request.onsuccess = () => {
        console.log('🗑️ All uploads cleared');
        this.notifyStatusChange();
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }
}

// Create global instance
window.uploadQueue = new PersistentUploadQueue();

console.log('📦 Persistent Upload Queue loaded');

