# Manual Test Checklist - Quick Validation

Use this checklist to quickly validate the three fixes implemented.

## ✅ Pre-requisites

- [ ] MongoDB is running
- [ ] Server is started (`npm start` or `node server.js`)
- [ ] Server is accessible at http://localhost:4000
- [ ] Have a USB webcam available for camera tests

---

## 🎥 Test 1: External Camera Auto-Switch

### Steps:
1. [ ] Open browser and navigate to http://localhost:4000
2. [ ] Login as teacher or register new teacher account
3. [ ] Create a new class and start it
4. [ ] Enable camera (built-in camera should be active)
5. [ ] **Plug in USB external webcam**
6. [ ] Watch for toast notification

### Expected Results:
- [ ] Toast notification appears: "Switched to [External Camera Name]"
- [ ] Video feed switches to external webcam automatically
- [ ] Video quality remains good
- [ ] No errors in browser console

### Actual Results:
```
Write observations here...
```

**Status: PASS / FAIL**

---

## 📹 Test 2: Recording Error Handling

### Steps:
1. [ ] Start a live class as teacher
2. [ ] Click "Start Recording" button
3. [ ] Verify recording indicator shows (red dot/timer)
4. [ ] Record for 2-3 minutes
5. [ ] Click "Stop Recording"
6. [ ] Wait for upload to complete

### Expected Results:
- [ ] Recording starts successfully
- [ ] Timer shows elapsed time
- [ ] Stop recording processes without errors
- [ ] Recording appears in recordings list
- [ ] If upload fails, fallback to local storage works
- [ ] Check server console for proper error logging

### Test 2B: Recording with Network Issues
7. [ ] Start new recording
8. [ ] Open browser DevTools → Network tab
9. [ ] Set network to "Offline" mode
10. [ ] Try to stop recording
11. [ ] Re-enable network

### Expected Results:
- [ ] Error is handled gracefully
- [ ] User sees appropriate error message
- [ ] Recording state resets properly
- [ ] Server logs show detailed error message

### Actual Results:
```
Write observations here...
```

**Status: PASS / FAIL**

---

## 🏫 Test 3: Institute/Location Fields

### Test 3A: Registration
1. [ ] Navigate to http://localhost:4000 (or click Register)
2. [ ] Fill in registration form
3. [ ] Enter institute: "Test University"
4. [ ] Enter location: "Test City, TS"
5. [ ] Complete registration

### Expected Results:
- [ ] Institute field is visible
- [ ] Location field is visible
- [ ] Both fields are optional (not required)
- [ ] Registration succeeds
- [ ] Redirected to dashboard

### Test 3B: View Profile
6. [ ] Click on profile/settings
7. [ ] Or call API: GET http://localhost:4000/auth/me

### Expected Results:
- [ ] Profile shows institute: "Test University"
- [ ] Profile shows location: "Test City, TS"
- [ ] API response includes both fields

### Test 3C: Update Profile
8. [ ] Change institute to "New University"
9. [ ] Change location to "New City, NC"
10. [ ] Save changes

### Expected Results:
- [ ] Update succeeds
- [ ] Changes are saved
- [ ] Refresh shows updated values

### Test 3D: List Institutes API
11. [ ] Open browser console or Postman
12. [ ] Make GET request to: http://localhost:4000/admin/institutes
13. [ ] Must be logged in as teacher

### Expected Results:
- [ ] Returns JSON with institutes array
- [ ] Returns JSON with locations array
- [ ] Arrays contain unique values
- [ ] Arrays are sorted alphabetically
- [ ] Response format:
```json
{
  "institutes": ["Test University", "New University", ...],
  "locations": ["Test City, TS", "New City, NC", ...]
}
```

### Actual Results:
```
Write observations here...
```

**Status: PASS / FAIL**

---

## 🔍 Additional Checks

### Browser Console Checks:
- [ ] No errors in console during any test
- [ ] No warning messages (except expected ones)
- [ ] WebSocket connections successful

### Server Console Checks:
- [ ] Server starts without errors
- [ ] No unhandled promise rejections
- [ ] Database connections successful
- [ ] Recording logs show proper info/error messages

### Network Tab Checks:
- [ ] All API calls return expected status codes
- [ ] WebSocket connection established
- [ ] Recording upload shows in network tab

---

## 📊 Summary

| Test | Status | Notes |
|------|--------|-------|
| External Camera Auto-Switch | ☐ PASS ☐ FAIL | |
| Recording Error Handling | ☐ PASS ☐ FAIL | |
| Institute/Location Fields | ☐ PASS ☐ FAIL | |

### Overall Result: ☐ ALL PASS ☐ ISSUES FOUND

---

## 🐛 Issues Found

List any issues or bugs discovered during testing:

1. 
2. 
3. 

---

## 📝 Notes

Additional observations or comments:

```
Write notes here...
```

---

## ✍️ Sign-off

- **Tester Name:** ___________________
- **Date:** ___________________
- **Environment:** ☐ Local ☐ Staging ☐ Production
- **Browser:** ___________________
- **OS:** ___________________

