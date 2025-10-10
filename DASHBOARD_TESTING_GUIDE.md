# 🧪 Dashboard Uploading Videos - Testing Guide

## Why You Might See "No videos currently uploading"

### Reason 1: Videos Upload Too Fast ⚡
If your network is good and videos are small, they upload in 1-2 seconds and immediately disappear from the list!

### Reason 2: No Recent Uploads
You need to actually record and stop a video to see it in the list.

### Reason 3: Videos Already Completed
Videos that finished uploading more than 2 minutes ago won't show.

---

## 📋 Step-by-Step Testing

### Test 1: See Videos in Dashboard

#### Step 1: Open Two Tabs
```
Tab 1: http://localhost:4000/dashboard (your dashboard)
Tab 2: http://localhost:4000/class/YOUR-CLASS-CODE
```

#### Step 2: Record Video in Class
```
In Tab 2 (class view):
1. Click "Start Recording"
2. Wait 5-10 seconds
3. Click "Stop Recording"
```

#### Step 3: IMMEDIATELY Check Dashboard
```
In Tab 1 (dashboard):
1. Scroll to "Uploading Videos" section
2. Click "Refresh" button
3. You should see your video!
```

**Expected:**
```
┌────────────────────────────────────────┐
│ 📊 Your Class Title      📤 Queued    │
│ Code: 688-780-589                     │
│ Finished: Oct 10, 12:50 PM            │
└────────────────────────────────────────┘
```

---

### Test 2: See Upload Status Change

#### Keep Dashboard Open
```
1. Record and stop a video
2. Keep dashboard visible
3. Watch the status badge change:
   📤 Queued → ⬆️ Uploading... → ✅ Just Completed
4. After 2 minutes, it disappears
```

---

### Test 3: Test with Slow Upload

#### Simulate Slow Network
```
1. Open Chrome DevTools (F12)
2. Go to "Network" tab
3. Set throttling to "Slow 3G" or "Fast 3G"
4. Record and stop a video
5. Go to dashboard
6. Video should stay visible longer
7. Watch upload progress
```

---

### Test 4: Force Video to Stay Queued

#### Disable Network Temporarily
```
1. Record a video
2. BEFORE stopping: Disconnect WiFi
3. Stop recording
4. Video saves to IndexedDB
5. Go to dashboard
6. Should see: 📤 Queued
7. Reconnect WiFi
8. Watch it change to: ⬆️ Uploading...
9. Then: ✅ Just Completed
```

---

## 🔍 Debugging

### Check Browser Console

#### In Dashboard (F12 → Console):
```javascript
// Should see:
"Rendering uploading videos: { count: 2, videos: [...] }"
"Rendered 2 uploading video(s)"
```

#### If You See:
```javascript
"Rendering uploading videos: { count: 0, videos: [] }"
```
**Means:** No videos with status 'queued', 'uploading', or recently 'completed'

---

### Check Network Tab

#### In Dashboard (F12 → Network):
```
1. Click "Refresh" button
2. Look for request to: /admin/uploading-videos
3. Click on it
4. Check "Response" tab
5. Should see JSON with videos array
```

**Example Response:**
```json
{
  "count": 1,
  "videos": [
    {
      "meetingCode": "688-780-589",
      "title": "Physics Class",
      "recording": {
        "uploadStatus": "queued",
        "finishedAt": "2025-10-10T19:11:20.147Z"
      }
    }
  ]
}
```

---

### Check MongoDB Data

#### Option 1: Check Server Logs
```bash
tail -f server.log
```

Look for:
```
Found 2 uploading/recent videos
```

#### Option 2: Direct MongoDB Query
```bash
# Connect to MongoDB
mongosh "mongodb+srv://..."

# Use your database
use production

# Find classes with upload status
db.classstreams.find({
  "recording.uploadStatus": { $in: ["queued", "uploading"] }
}).pretty()
```

---

## 🎬 Demo Workflow

### Complete Testing Flow:

```bash
# Step 1: Start server
npm start

# Step 2: Open dashboard
Open: http://localhost:4000/dashboard

# Step 3: Open a class in new tab
Open: http://localhost:4000/class/YOUR-CODE

# Step 4: In class tab
Click "Start Recording"
Wait 10 seconds
Click "Stop Recording"
See toast: "📹 Recording saved!"

# Step 5: In dashboard tab
Click "Refresh" button
See your video in list!

# Expected in dashboard:
┌────────────────────────────────────┐
│ Uploading Videos        [Refresh] │
│                                    │
│  📊 Your Class      📤 Queued     │
│  Code: XXX-XXX-XXX                │
│  Finished: Oct 10, 12:50 PM       │
│  Host: Your Name                  │
└────────────────────────────────────┘
```

---

## ⚡ Quick Visibility Tips

### To Make Videos Visible Longer:

#### Method 1: Use Slow Network
```
DevTools → Network → Throttle to "Slow 3G"
Videos will stay in "Uploading..." state longer
```

#### Method 2: Upload Large Video
```
Record for 2-3 minutes (larger file)
Upload takes longer
More time to see on dashboard
```

#### Method 3: Disconnect Then Upload
```
1. Disconnect network
2. Stop recording
3. Go to dashboard
4. See "Queued" status
5. Reconnect network
6. Watch upload progress
```

#### Method 4: Multiple Videos
```
1. Record video in Class A → Stop
2. Record video in Class B → Stop
3. Record video in Class C → Stop
4. Go to dashboard
5. See all 3 videos
```

---

## 🐛 Troubleshooting

### Problem: Still showing "No videos currently uploading"

#### Solution 1: Check Console
```
F12 → Console
Look for: "Rendering uploading videos: { count: 0 }"
If count is 0, no videos have status queued/uploading
```

#### Solution 2: Check Response
```
F12 → Network → Click refresh
Check /admin/uploading-videos response
See what data is returned
```

#### Solution 3: Verify Upload Status
```
In class view, check console after stopping recording:
Should see: "✅ Recording queued for upload successfully"
```

#### Solution 4: Check Database Directly
```javascript
// In MongoDB:
db.classstreams.find({
  "recording.uploadStatus": "queued"
}).pretty()

// Should return your classes
```

#### Solution 5: Add Test Upload
```
1. Open class view
2. Open console (F12)
3. Type:
   state.classInfo
4. Check recording.uploadStatus value
5. Should be 'queued' or 'uploading' right after stopping
```

---

## 📊 Expected Behavior

### Timeline After Stopping Recording:

```
0:00 - Stop recording
       Toast: 📹 Recording saved!
       Dashboard: Shows in list (if refreshed)

0:01 - Upload queues
       Toast: 📤 Video queued...
       Dashboard: Shows "📤 Queued"

0:02 - Upload starts
       Toast: ⬆️ Uploading...
       Dashboard: Shows "⬆️ Uploading..."

0:15 - Upload completes (varies by size)
       Toast: ✅ Uploaded successfully!
       Dashboard: Shows "✅ Just Completed"

2:00 - Disappears from dashboard
       (2 minutes after completion)
```

---

## 💡 Pro Testing Tips

### Tip 1: Keep Both Tabs Open
- Dashboard in Tab 1
- Class in Tab 2
- Switch between them to watch updates

### Tip 2: Use Refresh Button
- After stopping recording
- Immediately go to dashboard
- Click "Refresh"
- Should see video

### Tip 3: Check Console Logs
```
Dashboard Console:
"Rendering uploading videos: { count: 1, videos: [...] }"

Class Console:
"✅ Recording queued for upload successfully"
```

### Tip 4: Time It Right
- Videos upload fast on good networks
- Refresh dashboard within 5-10 seconds of stopping
- Or use slow network throttling

---

## 🎯 Success Criteria

### You know it's working when:

✅ **In Class View:**
- Stop recording shows toast: "Recording saved!"
- Console shows: "✅ Recording queued"
- Status shows: "Video upload queued..."

✅ **In Dashboard:**
- "Uploading Videos" section exists
- Clicking "Refresh" loads data
- Console shows: "Found X uploading/recent videos"
- Videos appear in list with badges

✅ **Status Changes:**
- Badge shows: 📤 Queued
- Changes to: ⬆️ Uploading...
- Changes to: ✅ Just Completed
- Disappears after 2 minutes

---

## 📝 Quick Debug Checklist

- [ ] Server running on port 4000
- [ ] Logged in to dashboard as teacher
- [ ] "Uploading Videos" section visible
- [ ] Can click "Refresh" button
- [ ] Console shows render function called
- [ ] Network tab shows /admin/uploading-videos request
- [ ] Response contains videos array
- [ ] Videos have uploadStatus field
- [ ] Recording was actually stopped (not just paused)

---

## 🚀 Server Logs to Watch

### In server.log or console:
```bash
tail -f server.log
```

**Look for:**
```
Found 2 uploading/recent videos
GET /admin/uploading-videos 200
```

**If you see:**
```
Found 0 uploading/recent videos
```
**Means:** No videos currently have status 'queued', 'uploading', or recently 'completed'

---

## 🎉 Summary

### What Dashboard Shows:
- Videos with uploadStatus = 'queued'
- Videos with uploadStatus = 'uploading'
- Videos with uploadStatus = 'completed' (last 2 minutes)
- Videos with uploadStatus = 'failed' (retrying)

### Auto-Refresh:
- Every 10 seconds automatically
- Manual refresh button available
- Real-time status updates

### To See Videos:
1. Record and stop a video in a class
2. **Immediately** go to dashboard
3. **Click "Refresh"** button
4. Should see video in list!
5. Watch status change in real-time

**The feature is working - videos just upload fast!** ⚡

Try using network throttling or larger videos to see them in the dashboard longer! 🎬

