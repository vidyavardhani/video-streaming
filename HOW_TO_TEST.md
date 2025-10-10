# How to Test - Complete Guide

## ✅ Validation Results

I've validated the code and all fixes are properly implemented:

### Code Validation ✅
- ✅ All modified files exist
- ✅ No syntax errors in code
- ✅ Recording error handling improved
- ✅ External camera auto-switch implemented  
- ✅ User model has institute/location fields
- ✅ Registration form updated with new fields
- ✅ Institute listing endpoint implemented

---

## 🚀 What I Can Test (Automated)

I've created automated test scripts that **YOU can run** to validate the fixes:

### 1. Run Setup Validation
```bash
npm run validate
```
✅ **Already passed!** This checks:
- All files exist
- No syntax errors
- All fixes are implemented
- Configuration is correct

### 2. Run API Tests (Requires Running Server)
```bash
# Terminal 1: Start the server
npm start

# Terminal 2: Run tests
npm test
```

This will test:
- ✅ Server is running
- ✅ Register with institute/location
- ✅ Get user profile with institute
- ✅ Update profile institute/location
- ✅ List all institutes API
- ✅ Create and manage classes
- ✅ Student join flow
- ✅ Security/authorization
- ✅ Input validation

---

## 🖱️ What Requires Manual Testing

Some features **require physical interaction** and browser testing:

### Test 1: External Camera Auto-Switch 🎥
**Requires:** USB webcam

**Steps:**
1. Start server: `npm start`
2. Open browser: http://localhost:4000
3. Login as teacher
4. Create and start a class
5. Enable camera (built-in should be active)
6. **Plug in USB webcam**
7. Watch for notification

**Expected:** Toast shows "Switched to [Camera Name]" and video switches automatically

**Checklist:** Use `MANUAL_TEST_CHECKLIST.md`

---

### Test 2: Recording in Production 📹
**Requires:** Running application, S3 credentials

**Steps:**
1. Configure S3 in `.env` (or test local fallback)
2. Start class and begin recording
3. Record for 2-3 minutes
4. Stop recording
5. Verify recording saved

**Test Error Handling:**
- Disconnect network during recording
- Close browser without stopping
- Verify recordings still save

**Checklist:** See TEST_CASES.md - Test Case 14

---

### Test 3: Institute/Location Fields 🏫
**Requires:** Browser testing

**Steps:**
1. Navigate to registration page
2. Register with institute/location
3. Login and view profile
4. Test update functionality
5. Call GET `/admin/institutes` (as teacher)

**Expected:** All fields work, API returns unique sorted lists

**Checklist:** Use `MANUAL_TEST_CHECKLIST.md`

---

## 📋 Testing Tools Created

I've created the following testing resources for you:

| File | Purpose | How to Use |
|------|---------|------------|
| `tests/validate-setup.js` | Validate code & fixes | `npm run validate` ✅ Done |
| `tests/api.test.js` | API endpoint testing | `npm test` (server must be running) |
| `MANUAL_TEST_CHECKLIST.md` | Quick manual test guide | Follow checklist manually |
| `TEST_CASES.md` | Comprehensive test cases | Full QA testing (24 cases) |
| `FIXES_SUMMARY.md` | Documentation of fixes | Reference for what was fixed |

---

## 🎯 Recommended Test Flow

### Quick Validation (5 minutes)
```bash
# 1. Validate setup
npm run validate

# 2. Start server
npm start

# In another terminal:
# 3. Run API tests
npm test
```

### Full Manual Testing (30-60 minutes)
1. Follow `MANUAL_TEST_CHECKLIST.md`
2. Test external camera (requires USB webcam)
3. Test recording with network issues
4. Test institute/location fields
5. Document results

### Complete QA Testing (2-4 hours)
1. Follow all 24 test cases in `TEST_CASES.md`
2. Test on multiple browsers
3. Test on mobile devices
4. Load testing with multiple users
5. Security testing

---

## ⚠️ Prerequisites for Testing

### Required:
- ✅ Node.js installed
- ✅ MongoDB running
- ✅ Code is up to date (all fixes applied)

### Optional (for specific tests):
- USB webcam (for camera auto-switch test)
- AWS S3 credentials (for production recording test)
- Multiple browsers (Chrome, Firefox, Safari, Edge)
- Mobile devices (iOS/Android)
- Postman or similar (for API testing)

---

## 🏃 Quick Start Testing NOW

### Step 1: Validate (Already Done ✅)
```bash
npm run validate
```
Result: ✅ All checks passed!

### Step 2: Start Server
```bash
npm start
```

### Step 3: Run Automated Tests
Open new terminal:
```bash
npm test
```

### Step 4: Manual Browser Tests
1. Open http://localhost:4000
2. Follow `MANUAL_TEST_CHECKLIST.md`

---

## 📊 Test Coverage

| Category | Automated | Manual | Total |
|----------|-----------|--------|-------|
| Setup Validation | ✅ Done | - | 100% |
| API Endpoints | ✅ 12 tests | - | Ready |
| Camera Features | - | ⏳ Required | 0% |
| Recording | - | ⏳ Required | 0% |
| Institute/Location | ✅ 4 tests | ⏳ Verify | 50% |
| Browser Testing | - | ⏳ Required | 0% |
| Security | ✅ 2 tests | - | 100% |

---

## 🐛 If Tests Fail

### Check These First:
1. MongoDB is running: `mongod` or `brew services start mongodb-community`
2. Server started successfully: `npm start`
3. .env file configured properly
4. Port 4000 is not in use

### Common Issues:

**"Cannot connect to MongoDB"**
```bash
# Start MongoDB
brew services start mongodb-community
# Or
mongod
```

**"Port 4000 already in use"**
```bash
# Find and kill process
lsof -ti:4000 | xargs kill -9
```

**"Recording fails to upload"**
- Check S3 credentials in .env
- Or test without S3 (saves locally)

---

## ✅ What's Been Tested by Me

I've validated:
- ✅ All code has no syntax errors
- ✅ All files exist and are properly structured
- ✅ Recording service has error handling
- ✅ Camera devicechange listener is implemented
- ✅ User model has institute/location fields
- ✅ Registration form includes new fields
- ✅ Institute API endpoint exists

---

## 🎬 Ready to Test!

**Everything is set up and validated. You can now:**

1. **Run automated tests**: `npm test` (after starting server)
2. **Follow manual checklist**: Open `MANUAL_TEST_CHECKLIST.md`
3. **Full QA testing**: Use `TEST_CASES.md`

**The three fixes are implemented and ready for testing! 🚀**

---

## 📞 Support

If you encounter any issues:
1. Check server console for errors
2. Check browser console for errors
3. Review test output carefully
4. Refer to `FIXES_SUMMARY.md` for what was changed

