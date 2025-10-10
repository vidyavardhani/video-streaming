# 📺 How to See Uploading Videos on Dashboard

## 🎯 Quick Answer

The dashboard shows videos that are **currently uploading** (status = queued/uploading). If videos upload fast, you need to check the dashboard **within 10-30 seconds** of stopping the recording!

---

## ✅ Simple Test (2 Minutes)

### 1. **Open Dashboard**
```
http://localhost:4000/dashboard
```
Keep this tab open!

### 2. **Open Class in New Tab**
```
http://localhost:4000/class/YOUR-MEETING-CODE
```

### 3. **Record Video**
```
Click: "Start Recording"
Wait: 5-10 seconds  
Click: "Stop Recording"
```

### 4. **Check Dashboard IMMEDIATELY**
```
Switch to dashboard tab
Click: "Refresh" button
Look at: "Uploading Videos" section
```

**You should see:**
```
┌─────────────────────────────────────────┐
│ 📊 Your Class Title       📤 Queued    │
│ Code: XXX-XXX-XXX                      │
│ Finished: Oct 10, 12:55 PM             │
│ Host: Your Name                        │
└─────────────────────────────────────────┘
```

---

## 🐌 Want to See It Longer? Use Slow Network!

### Option 1: Chrome DevTools Throttling
```
1. In class tab: Press F12
2. Click "Network" tab
3. Change throttle from "No throttling" to "Slow 3G"
4. Record and stop video
5. Go to dashboard
6. Video will stay visible 30-60 seconds! ✅
```

### Option 2: Record Longer Video
```
1. Record for 2-3 minutes (larger file)
2. Stop recording
3. Upload takes longer
4. More time to see on dashboard
```

### Option 3: Test Offline Mode
```
1. Record video
2. Disconnect WiFi BEFORE stopping
3. Stop recording
4. Video saves to IndexedDB
5. Go to dashboard
6. See: 📤 Queued (stays there!)
7. Reconnect WiFi
8. Watch: 📤 Queued → ⬆️ Uploading... → ✅ Completed
```

---

## 📊 What Dashboard Shows

### Currently Shows (Real-time):
- ✅ Videos with status: **"queued"**
- ✅ Videos with status: **"uploading"**
- ✅ Videos with status: **"completed"** (last 2 minutes only)
- ✅ Videos with status: **"failed"** (retrying)

### Does NOT Show:
- ❌ Videos completed more than 2 minutes ago
- ❌ Recordings that haven't been stopped
- ❌ Videos that never had an upload status

---

## 🔔 Status Badge Guide

| Badge | Meaning | Duration Visible |
|-------|---------|------------------|
| 📤 Queued | Waiting to upload | Until upload starts |
| ⬆️ Uploading... | Currently uploading | 5-30 seconds (varies) |
| ✅ Just Completed | Upload finished | Shows for 2 minutes |
| ⚠️ Retrying... | Failed, will retry | Until retry succeeds |

---

## 🧪 Console Debugging

### Open Dashboard Console (F12)

#### Check if function is called:
```javascript
// Should see when you click Refresh:
"Rendering uploading videos: { count: 1, videos: [...] }"
"Rendered 1 uploading video(s)"
```

#### Manually call the function:
```javascript
// Type in console:
fetch('/admin/uploading-videos')
  .then(r => r.json())
  .then(data => console.log(data));

// Should show:
{ count: 1, videos: [...] }
```

---

## 📸 Visual Example

### Empty State (No Uploads)
```
┌────────────────────────────────────────┐
│ Uploading Videos         [Refresh]    │
│ Videos currently being uploaded.       │
├────────────────────────────────────────┤
│                                        │
│ No videos currently uploading.         │
│                                        │
└────────────────────────────────────────┘
```

### With Uploading Videos
```
┌────────────────────────────────────────┐
│ Uploading Videos         [Refresh]    │
│ Videos currently being uploaded.       │
├────────────────────────────────────────┤
│                                        │
│  📊 Physics Class       📤 Queued     │
│  Code: 688-780-589                    │
│  Finished: Oct 10, 12:50 PM           │
│  Host: John Doe                       │
│                                        │
│  📊 Math Lecture       ⬆️ Uploading... │
│  Code: 123-456-789                    │
│  Finished: Oct 10, 12:52 PM           │
│  Host: Jane Smith                     │
│                                        │
└────────────────────────────────────────┘
```

### Just Completed (Shows for 2 mins)
```
┌────────────────────────────────────────┐
│ Uploading Videos         [Refresh]    │
├────────────────────────────────────────┤
│                                        │
│  📊 Science Lab    ✅ Just Completed  │
│  Code: 999-888-777                    │
│  Finished: Oct 10, 12:53 PM           │
│  Host: Dr. Smith                      │
│  [View Recording]                     │
│                                        │
└────────────────────────────────────────┘
```

---

## ⏱️ Timing Guide

### Good Network (Fast Upload):
```
0:00 - Stop recording
0:01 - Upload queued
0:02 - Upload starts
0:05 - Upload completes ✅
0:05 to 2:05 - Shows "Just Completed" on dashboard
2:05 - Disappears from dashboard
```
**Window to see it: 2 minutes after completion**

### Slow Network:
```
0:00 - Stop recording
0:01 - Upload queued
0:05 - Upload starts
0:45 - Upload completes ✅
0:45 to 2:45 - Shows "Just Completed" on dashboard
2:45 - Disappears from dashboard
```
**Window to see it: Longer (2 mins after completion)**

### Offline Mode:
```
0:00 - Stop recording (offline)
0:01 - Saved to IndexedDB
       Shows "📤 Queued" INDEFINITELY
Until: Network returns
Then: Uploads and completes
```
**Window to see it: Until upload succeeds**

---

## 🎯 Best Way to Test

### The Foolproof Method:

```bash
# 1. Open dashboard, keep it visible
Open: http://localhost:4000/dashboard

# 2. Throttle network (makes upload slower)
DevTools (F12) → Network → Throttle to "Fast 3G"

# 3. Open class in new tab
Open: http://localhost:4000/class/YOUR-CODE

# 4. Record video
Start recording → Wait 10 seconds → Stop

# 5. Immediately switch to dashboard tab
Switch to dashboard
Click "Refresh"

# 6. Watch the magic happen!
📤 Queued (appears immediately)
⬆️ Uploading... (appears after 1-2 seconds)
✅ Just Completed (appears after 10-30 seconds)
(stays visible for 2 minutes, then disappears)
```

---

## 📞 Still Not Seeing Videos?

### Check These:

#### 1. Is Recording Actually Stopping?
```
In class view, after clicking "Stop Recording":
- Should see toast: "📹 Recording saved!"
- Console should show: "✅ Recording queued"
```

#### 2. Is Upload Status Being Set?
```
Check server logs:
tail -f server.log

Should see:
"Recording queued for upload: XXX-XXX-XXX"
```

#### 3. Is Dashboard Calling API?
```
Dashboard Network tab:
Should see request to: /admin/uploading-videos
Response should have: { count: 1, videos: [...] }
```

#### 4. Are You Logged In?
```
Dashboard must be logged in as teacher
Check top right for your name
If not logged in, redirects to login page
```

---

## 🎬 Video Tutorial Steps

### Record Your Screen While Testing:

1. **Setup**
   - Open dashboard (keep visible)
   - Open class in new tab
   - Open DevTools in class tab

2. **Record**
   - Throttle to "Slow 3G"
   - Start recording
   - Wait 10 seconds
   - Stop recording

3. **Monitor**
   - Watch console: "✅ Recording queued"
   - Switch to dashboard tab
   - Click "Refresh"
   - See video appear!
   - Watch status change
   - Wait 2 minutes
   - See it disappear

---

## ✅ Checklist

Before reporting issues, verify:

- [ ] Server is running (port 4000)
- [ ] Logged in to dashboard as teacher
- [ ] "Uploading Videos" section is visible
- [ ] Can click "Refresh" button
- [ ] Recording actually stops (not just paused)
- [ ] Console shows "Recording queued"
- [ ] Network tab shows API call
- [ ] Response has videos array
- [ ] Checked within 2 minutes of upload

---

## 🎉 Summary

### Why "No videos currently uploading" Shows:

1. **Videos upload too fast** (5-15 seconds on good network)
2. **Already completed** (more than 2 minutes ago)
3. **Haven't stopped a recording recently**

### How to See Videos:

1. **Use network throttling** (Slow 3G)
2. **Record longer videos** (2-3 minutes)
3. **Check immediately** after stopping
4. **Click "Refresh"** button
5. **Test offline mode** (videos stay queued)

### What to Expect:

- Videos appear when status is queued/uploading
- Auto-refresh every 10 seconds
- Recently completed videos show for 2 minutes
- Then disappear (upload successful!)

**The feature IS working - videos just upload fast!** ⚡

Use network throttling to see them for longer! 🎬

