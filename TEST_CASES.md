# Test Cases - Video Streaming Platform

## Core Functionality Test Cases

### Test Case 1: Teacher Starts the Class

| **Step No.** | 1 |
|--------------|---|
| **Function / Scenario** | Teacher Starts the Class |
| **Pre-requisites** | Teacher account created and logged in |
| **Detailed Description** | 1. Teacher logs in with valid credentials<br>2. Navigates to dashboard<br>3. Clicks on an existing class or creates new class<br>4. Clicks 'Start Live Class' button |
| **Expected Result** | - Live class window opens successfully<br>- Teacher is connected with audio/video preview<br>- Class status changes to 'Live'<br>- Meeting code is displayed<br>- Host controls are visible<br>- No console errors |
| **Status (Pass/Fail)** | |
| **Comments** | |

---

### Test Case 2: Camera & Setup Adjustment

| **Step No.** | 2 |
|--------------|---|
| **Function / Scenario** | Camera & Setup Adjustment |
| **Pre-requisites** | Teacher in live class with camera/mic permissions granted |
| **Detailed Description** | **Test 2A - Camera Toggle:**<br>1. Click camera button to turn off<br>2. Verify video stream stops<br>3. Click again to turn on<br>4. Verify video resumes<br><br>**Test 2B - Mic Toggle:**<br>1. Click mic button to mute<br>2. Verify audio is muted<br>3. Click to unmute<br>4. Verify audio is active<br><br>**Test 2C - Zoom Controls:**<br>1. Click zoom in button (+)<br>2. Verify video preview enlarges<br>3. Click zoom out button (-)<br>4. Verify video preview shrinks<br><br>**Test 2D - External Webcam:**<br>1. Click camera settings/switch camera<br>2. Select external webcam from dropdown<br>3. Verify camera switches successfully |
| **Expected Result** | - Camera on/off works instantly<br>- Mic mute/unmute works smoothly<br>- Zoom adjusts view from 0.8x to 1.8x<br>- External webcam selection works<br>- Camera indicator updates correctly<br>- No lag or freezing |
| **Status (Pass/Fail)** | |
| **Comments** | |

---

### Test Case 3: Recording Start

| **Step No.** | 3 |
|--------------|---|
| **Function / Scenario** | Recording Start |
| **Pre-requisites** | Teacher in active live class |
| **Detailed Description** | 1. Teacher clicks 'Record' button from host controls<br>2. Observe recording indicator appears<br>3. Verify timer starts counting from 00:00<br>4. Check recording status is broadcast to participants |
| **Expected Result** | - Recording starts immediately (within 1-2 seconds)<br>- Timer indicator shows elapsed time<br>- Recording icon/button changes to 'Stop Recording'<br>- All participants see recording indicator<br>- No error messages<br>- Server receives start recording confirmation |
| **Status (Pass/Fail)** | |
| **Comments** | |

---

### Test Case 4: Students Join Live Class

| **Step No.** | 4 |
|--------------|---|
| **Function / Scenario** | Students Join Live Class |
| **Pre-requisites** | Live class is running, students have meeting code/link |
| **Detailed Description** | **Test 4A - Join at Start:**<br>1. Student enters class code immediately after class starts<br>2. Enters display name<br>3. Clicks 'Join Live'<br><br>**Test 4B - Join Mid-Session:**<br>1. Student joins 30 minutes into class<br>2. Enters display name<br>3. Clicks 'Join Live'<br><br>**Test 4C - Multiple Students:**<br>1. Have 5+ students join simultaneously<br>2. Verify all connections established |
| **Expected Result** | - Student request appears in host's lobby/waiting room<br>- After host admits, student joins instantly<br>- Student sees live stream immediately<br>- Mid-session joins work seamlessly<br>- Multiple simultaneous joins handled smoothly<br>- Student count updates for teacher<br>- No connection delays >3 seconds |
| **Status (Pass/Fail)** | |
| **Comments** | |

---

### Test Case 5: Live Interaction & Chat

| **Step No.** | 5 |
|--------------|---|
| **Function / Scenario** | Live Interaction & Chat |
| **Pre-requisites** | Teacher and students in live class |
| **Detailed Description** | **Test 5A - Student Sends Message:**<br>1. Student types message in chat box<br>2. Clicks send or presses Enter<br>3. Message appears in student's chat<br>4. Teacher receives message<br><br>**Test 5B - Teacher Replies:**<br>1. Teacher types response<br>2. Sends message<br>3. All students see teacher's message<br><br>**Test 5C - Chat History:**<br>1. Scroll through chat history<br>2. Verify all messages preserved<br><br>**Test 5D - System Messages:**<br>1. Student joins/leaves<br>2. Verify system messages appear |
| **Expected Result** | - Messages deliver in real-time (<1 second)<br>- All participants see messages correctly<br>- Sender name displayed accurately<br>- Timestamps are correct<br>- Chat scrolls automatically to new messages<br>- Emoji and special characters supported<br>- Chat history preserved throughout session |
| **Status (Pass/Fail)** | |
| **Comments** | |

---

### Test Case 6: Student Mic Access

| **Step No.** | 6 |
|--------------|---|
| **Function / Scenario** | Student Mic Access |
| **Pre-requisites** | Teacher and students in live class |
| **Detailed Description** | **Test 6A - Raise Hand:**<br>1. Student clicks 'Raise Hand' button<br>2. Verify hand icon appears for teacher<br>3. Teacher sees notification<br><br>**Test 6B - Grant Permission:**<br>1. Teacher clicks 'Allow' on student's hand raise<br>2. Student receives mic permission notification<br>3. Student unmutes mic<br>4. Verify teacher hears student<br><br>**Test 6C - Revoke Permission:**<br>1. Teacher clicks to mute student or revoke permission<br>2. Student's mic is muted<br><br>**Test 6D - Multiple Students:**<br>1. Multiple students raise hands<br>2. Teacher manages permissions individually |
| **Expected Result** | - Hand raise appears instantly to teacher<br>- Permission grant notification shows to student<br>- Only teacher hears student's audio<br>- Other students remain muted<br>- Teacher can control student mic remotely<br>- Hand raise list updates correctly<br>- Audio quality is clear |
| **Status (Pass/Fail)** | |
| **Comments** | |

---

### Test Case 7: Screen Share

| **Step No.** | 7 |
|--------------|---|
| **Function / Scenario** | Screen Share |
| **Pre-requisites** | Teacher in live class with students |
| **Detailed Description** | **Test 7A - Share Entire Screen:**<br>1. Teacher clicks 'Share Screen'<br>2. Selects entire screen option<br>3. Confirms browser permission<br>4. Students observe screen share<br><br>**Test 7B - Share Application Window:**<br>1. Teacher selects specific application<br>2. Shares application window<br>3. Verify only that window is shared<br><br>**Test 7C - Share Browser Tab:**<br>1. Teacher selects browser tab option<br>2. Shares specific tab (PDF, PPT, etc.)<br>3. Students see tab content<br><br>**Test 7D - Stop Sharing:**<br>1. Teacher clicks 'Stop Sharing'<br>2. Screen share ends for all students |
| **Expected Result** | - Screen share starts within 2-3 seconds<br>- All students see shared content clearly<br>- Screen updates in real-time (minimal lag)<br>- Audio continues during screen share<br>- Stop sharing works immediately<br>- Video resumes after stopping screen share<br>- No quality degradation |
| **Status (Pass/Fail)** | |
| **Comments** | |

---

### Test Case 8: Continuous Session

| **Step No.** | 8 |
|--------------|---|
| **Function / Scenario** | Continuous Session |
| **Pre-requisites** | Live class started with students joined |
| **Detailed Description** | **Test 8A - 2 Hour Session:**<br>1. Start live class<br>2. Run continuously for 2 hours<br>3. Monitor connection stability<br>4. Interact periodically (chat, screen share, etc.)<br>5. Check for disconnections or errors<br><br>**Test 8B - Connection Recovery:**<br>1. Simulate brief network interruption<br>2. Verify auto-reconnect works<br><br>**Test 8C - Memory Usage:**<br>1. Monitor browser memory during long session<br>2. Ensure no memory leaks |
| **Expected Result** | - Stream remains stable for full 2+ hours<br>- No unexpected disconnections<br>- Audio/video quality remains consistent<br>- No lag or freezing issues<br>- Recording continues uninterrupted if active<br>- Chat and interactions work throughout<br>- Auto-reconnect works if connection drops<br>- Browser memory usage stable |
| **Status (Pass/Fail)** | |
| **Comments** | |

---

### Test Case 9: Class End & Auto Save

| **Step No.** | 9 |
|--------------|---|
| **Function / Scenario** | Class End & Auto Save |
| **Pre-requisites** | Active class with recording in progress |
| **Detailed Description** | **Test 9A - Normal End:**<br>1. Teacher clicks 'End Class' button<br>2. Confirms end class dialog<br>3. Wait for recording to process<br>4. Navigate to recordings section<br>5. Verify recording is listed<br><br>**Test 9B - Recording Metadata:**<br>1. Check recording shows correct date/time<br>2. Verify duration is accurate<br>3. Check class title is correct<br><br>**Test 9C - Recording Playback:**<br>1. Click on saved recording<br>2. Play recording<br>3. Verify audio/video quality |
| **Expected Result** | - Recording stops automatically when class ends<br>- Recording is uploaded to server/S3<br>- Recording appears in 'Recordings' section within 1 minute<br>- Recording metadata is accurate (date, time, duration)<br>- Recording link is accessible<br>- No data loss during save<br>- All participants disconnected properly |
| **Status (Pass/Fail)** | |
| **Comments** | |

---

### Test Case 10: Auto Save on Timeout

| **Step No.** | 10 |
|--------------|---|
| **Function / Scenario** | Auto Save on Timeout |
| **Pre-requisites** | Active recording session |
| **Detailed Description** | **Test 10A - Browser Close:**<br>1. Teacher starts recording<br>2. Record for 5+ minutes<br>3. Close browser tab abruptly (don't click stop)<br>4. Check server logs and recordings<br>5. Verify recording is saved<br><br>**Test 10B - Network Disconnection:**<br>1. Start recording<br>2. Disconnect network during recording<br>3. Wait 30 seconds<br>4. Reconnect network<br>5. Check if recording saved<br><br>**Test 10C - Class Auto-End:**<br>1. End class without explicitly stopping recording<br>2. Verify recording stops and saves automatically |
| **Expected Result** | - Recording data is preserved even if browser closes<br>- System auto-saves recording on unexpected exit<br>- Recording appears in recordings list<br>- At minimum, partial recording is saved<br>- No corruption in saved recording file<br>- Server logs show safe shutdown |
| **Status (Pass/Fail)** | |
| **Comments** | |

---

### Test Case 11: Students Access Recording

| **Step No.** | 11 |
|--------------|---|
| **Function / Scenario** | Students Access Recording |
| **Pre-requisites** | Completed class with saved recording |
| **Detailed Description** | **Test 11A - View Recording List:**<br>1. Student logs in<br>2. Navigates to recordings section<br>3. Verifies enrolled class recordings are visible<br><br>**Test 11B - Play Recording:**<br>1. Student clicks on a recording<br>2. Recording player opens<br>3. Click play button<br>4. Watch for 2-3 minutes<br><br>**Test 11C - Recording Controls:**<br>1. Test pause/resume<br>2. Test seek/scrub through timeline<br>3. Test volume control<br>4. Test fullscreen mode<br><br>**Test 11D - Multiple Students:**<br>1. Have 3+ students access same recording simultaneously<br>2. Verify all can play without issues |
| **Expected Result** | - Only enrolled students see recordings<br>- Recording loads within 3-5 seconds<br>- Playback is smooth without buffering<br>- All player controls work properly<br>- Audio/video are in sync<br>- Can seek to any point in recording<br>- Multiple simultaneous views supported<br>- Recording quality is good |
| **Status (Pass/Fail)** | |
| **Comments** | |

---

### Test Case 12: Students Leave Anytime

| **Step No.** | 12 |
|--------------|---|
| **Function / Scenario** | Students Leave Anytime |
| **Pre-requisites** | Students joined in active class |
| **Detailed Description** | **Test 12A - Leave During Class:**<br>1. Student clicks 'Leave Class' button<br>2. Confirms leave action if prompted<br>3. Observe student disconnects<br><br>**Test 12B - Verify Teacher Side:**<br>1. Check teacher's participant list<br>2. Verify student is removed or marked as left<br>3. Check participant count decreased<br><br>**Test 12C - Verify Other Students:**<br>1. Check that other students' connections unaffected<br>2. Verify chat and video continue normally<br><br>**Test 12D - Rejoin After Leaving:**<br>1. Student who left tries to rejoin<br>2. Verify rejoin is successful |
| **Expected Result** | - Student exits cleanly without errors<br>- Student redirected to end/exit page<br>- Teacher sees participant list update<br>- System message "Student left" appears in chat<br>- Other students unaffected<br>- Recording continues if active<br>- Student can rejoin if needed |
| **Status (Pass/Fail)** | |
| **Comments** | |

---

## New Features Test Cases (Recent Fixes)

### Test Case 13: External Camera Auto-Switch

| **Step No.** | 13 |
|--------------|---|
| **Function / Scenario** | External Camera Auto-Switch |
| **Pre-requisites** | Teacher/student in class with built-in camera active |
| **Detailed Description** | **Test 13A - Connect External Camera:**<br>1. Start with built-in camera active<br>2. Plug in USB external webcam<br>3. Observe system behavior<br>4. Check for notification<br><br>**Test 13B - Verify Auto-Switch:**<br>1. Confirm video source changes to external camera<br>2. Verify video quality<br>3. Check camera label in settings<br><br>**Test 13C - Disconnect External Camera:**<br>1. Unplug external camera<br>2. Verify fallback to built-in camera<br><br>**Test 13D - Multiple External Cameras:**<br>1. Connect 2 external cameras<br>2. Test switching between them |
| **Expected Result** | - System detects new camera within 2 seconds<br>- Toast notification appears: "Switched to [Camera Name]"<br>- Video stream switches automatically to external camera<br>- No interruption in video feed<br>- Camera menu updates with new device<br>- Preference is saved<br>- Peers see the updated video stream |
| **Status (Pass/Fail)** | |
| **Comments** | Requires physical USB webcam for testing |

---

### Test Case 14: Recording Error Handling (Production Fix)

| **Step No.** | 14 |
|--------------|---|
| **Function / Scenario** | Recording Error Handling |
| **Pre-requisites** | Active class with recording capability |
| **Detailed Description** | **Test 14A - Normal Recording:**<br>1. Start recording<br>2. Record for 5 minutes<br>3. Stop recording normally<br>4. Verify upload to S3/local storage<br><br>**Test 14B - Network Failure During Upload:**<br>1. Start recording<br>2. Record for 2 minutes<br>3. Simulate network disconnect before stop<br>4. Attempt to stop recording<br>5. Verify error handling<br><br>**Test 14C - Empty Recording Blob:**<br>1. Start recording with mock empty data<br>2. Attempt to stop<br>3. Verify proper error message<br><br>**Test 14D - S3 Upload Failure:**<br>1. Configure invalid S3 credentials<br>2. Start and stop recording<br>3. Verify fallback to local storage |
| **Expected Result** | - Normal recording uploads successfully<br>- Error logs appear in server console (production)<br>- User receives appropriate error message<br>- Recording state resets properly on error<br>- No orphaned recordings<br>- Fallback to local storage works<br>- Class can continue after recording error |
| **Status (Pass/Fail)** | |
| **Comments** | Check server logs for detailed error messages |

---

### Test Case 15: Institute/Location Registration

| **Step No.** | 15 |
|--------------|---|
| **Function / Scenario** | Institute/Location Registration |
| **Pre-requisites** | Registration page accessible |
| **Detailed Description** | **Test 15A - Register with Institute:**<br>1. Navigate to registration page<br>2. Fill required fields (name, email, password, role)<br>3. Fill optional fields: Institute: "Harvard University", Location: "Boston, MA"<br>4. Submit registration<br>5. Verify account created<br><br>**Test 15B - Register without Institute:**<br>1. Fill only required fields<br>2. Leave institute/location empty<br>3. Submit registration<br>4. Verify account created with null values<br><br>**Test 15C - View Profile:**<br>1. Login with new account<br>2. Navigate to profile/me endpoint<br>3. Verify institute and location are returned |
| **Expected Result** | - Institute and location fields appear on registration form<br>- Fields are marked as optional<br>- Registration succeeds with or without these fields<br>- Data is saved correctly in database<br>- Profile endpoint returns institute/location<br>- Null values handled gracefully<br>- Form validation trims whitespace |
| **Status (Pass/Fail)** | |
| **Comments** | |

---

### Test Case 16: Institute Listing API

| **Step No.** | 16 |
|--------------|---|
| **Function / Scenario** | Institute Listing API |
| **Pre-requisites** | Multiple users registered with various institutes |
| **Detailed Description** | **Test 16A - Create Test Data:**<br>1. Register 5 users with different institutes:<br>   - User 1: Harvard University, Boston<br>   - User 2: MIT, Cambridge<br>   - User 3: Stanford, Palo Alto<br>   - User 4: Harvard University, Boston (duplicate)<br>   - User 5: No institute<br><br>**Test 16B - Call API:**<br>1. Login as teacher<br>2. Make GET request to `/admin/institutes`<br>3. Verify response structure<br><br>**Test 16C - Verify Data:**<br>1. Check institutes array contains unique values<br>2. Check locations array contains unique values<br>3. Verify sorting (alphabetical)<br>4. Ensure null/empty values excluded |
| **Expected Result** | - API returns JSON with institutes and locations arrays<br>- Only unique values listed (no duplicates)<br>- Arrays are sorted alphabetically<br>- Null and empty strings excluded<br>- Response format:<br>```json<br>{<br>  "institutes": ["Harvard University", "MIT", "Stanford"],<br>  "locations": ["Boston", "Cambridge", "Palo Alto"]<br>}<br>```<br>- Only teachers can access this endpoint<br>- Students get 403 Forbidden |
| **Status (Pass/Fail)** | |
| **Comments** | |

---

### Test Case 17: Profile Update with Institute/Location

| **Step No.** | 17 |
|--------------|---|
| **Function / Scenario** | Profile Update with Institute/Location |
| **Pre-requisites** | User logged in with existing account |
| **Detailed Description** | **Test 17A - Update Institute:**<br>1. Navigate to profile settings<br>2. Change institute to "New University"<br>3. Save changes<br>4. Verify update successful<br><br>**Test 17B - Update Location:**<br>1. Change location to "New City, State"<br>2. Save changes<br>3. Verify update successful<br><br>**Test 17C - Clear Fields:**<br>1. Set institute to empty string<br>2. Save changes<br>3. Verify field becomes null<br><br>**Test 17D - API Update:**<br>1. Use PATCH `/auth/update-profile`<br>2. Send institute and location in request body<br>3. Verify response includes updated values |
| **Expected Result** | - Profile update form includes institute/location fields<br>- Fields can be updated independently<br>- Empty values convert to null<br>- Whitespace is trimmed<br>- Update confirmation message shown<br>- GET `/auth/me` returns updated values<br>- Changes persist after logout/login |
| **Status (Pass/Fail)** | |
| **Comments** | |

---

## Performance Test Cases

### Test Case 18: Load Testing - Multiple Concurrent Classes

| **Step No.** | 18 |
|--------------|---|
| **Function / Scenario** | Multiple Concurrent Classes |
| **Detailed Description** | 1. Start 5 live classes simultaneously<br>2. Have 10 students join each class<br>3. Activate recordings in all classes<br>4. Run for 30 minutes<br>5. Monitor server resources |
| **Expected Result** | - All classes remain stable<br>- No significant performance degradation<br>- Server CPU usage < 80%<br>- Memory usage stable<br>- All recordings save successfully |
| **Status (Pass/Fail)** | |
| **Comments** | |

---

### Test Case 19: Browser Compatibility

| **Step No.** | 19 |
|--------------|---|
| **Function / Scenario** | Cross-Browser Testing |
| **Detailed Description** | Test core functionality on:<br>1. Chrome (latest)<br>2. Firefox (latest)<br>3. Safari (latest)<br>4. Edge (latest)<br><br>Test: Join class, video/audio, chat, screen share, recording playback |
| **Expected Result** | - All features work on modern browsers<br>- Camera/mic permissions work correctly<br>- WebRTC connections establish successfully<br>- UI renders properly on all browsers |
| **Status (Pass/Fail)** | |
| **Comments** | |

---

### Test Case 20: Mobile Responsive Testing

| **Step No.** | 20 |
|--------------|---|
| **Function / Scenario** | Mobile Device Testing |
| **Detailed Description** | Test on mobile devices (iOS and Android):<br>1. Student joins class from mobile<br>2. Test video controls<br>3. Test chat functionality<br>4. Test hand raise<br>5. Test orientation changes |
| **Expected Result** | - UI adapts to mobile screen size<br>- Touch controls work smoothly<br>- Camera switching works (front/back)<br>- Audio/video quality acceptable<br>- Portrait/landscape modes supported |
| **Status (Pass/Fail)** | |
| **Comments** | |

---

## Security Test Cases

### Test Case 21: Authentication & Authorization

| **Step No.** | 21 |
|--------------|---|
| **Function / Scenario** | Access Control |
| **Detailed Description** | **Test 21A - Unauthorized Access:**<br>1. Try to access `/admin/institutes` without login<br>2. Try to access as student role<br><br>**Test 21B - Recording Access:**<br>1. Try to access another class's recording<br>2. Verify access denied<br><br>**Test 21C - Host Controls:**<br>1. Student tries to start recording<br>2. Student tries to end class<br>3. Verify permission denied |
| **Expected Result** | - Unauthenticated users get 401<br>- Unauthorized roles get 403<br>- Students cannot access teacher-only endpoints<br>- Students cannot access other classes' recordings<br>- Only host can control class and recordings |
| **Status (Pass/Fail)** | |
| **Comments** | |

---

## Database Test Cases

### Test Case 22: Data Persistence

| **Step No.** | 22 |
|--------------|---|
| **Function / Scenario** | Data Integrity |
| **Detailed Description** | 1. Create class with recording<br>2. Restart server<br>3. Verify class data persists<br>4. Verify recording link still works<br>5. Check user institute/location data |
| **Expected Result** | - All data persists after server restart<br>- Recording links remain valid<br>- User profiles retain institute/location<br>- No data corruption |
| **Status (Pass/Fail)** | |
| **Comments** | |

---

## Edge Cases & Error Scenarios

### Test Case 23: Network Resilience

| **Step No.** | 23 |
|--------------|---|
| **Function / Scenario** | Poor Network Conditions |
| **Detailed Description** | 1. Simulate slow network (throttle to 3G)<br>2. Join class and observe behavior<br>3. Test with packet loss simulation<br>4. Test reconnection after disconnect |
| **Expected Result** | - Graceful degradation of quality<br>- Auto-reconnect attempts<br>- User feedback for connection issues<br>- No crashes or freezes |
| **Status (Pass/Fail)** | |
| **Comments** | Use browser DevTools Network throttling |

---

### Test Case 24: Invalid Input Handling

| **Step No.** | 24 |
|--------------|---|
| **Function / Scenario** | Input Validation |
| **Detailed Description** | 1. Try registering with invalid email format<br>2. Try very long institute name (>1000 chars)<br>3. Try special characters in location<br>4. Try SQL injection in text fields<br>5. Try XSS in chat messages |
| **Expected Result** | - Proper validation error messages<br>- No server errors<br>- XSS attempts sanitized<br>- SQL injection prevented<br>- Long strings truncated or rejected |
| **Status (Pass/Fail)** | |
| **Comments** | |

---

## Test Execution Notes

### Setup Requirements
- Node.js and MongoDB installed
- AWS S3 credentials configured (for production recording tests)
- Multiple test accounts created (teachers and students)
- External USB webcam available for camera tests
- Multiple browsers installed
- Mobile devices for mobile testing

### Test Data
- Create at least 3 teacher accounts
- Create at least 10 student accounts
- Create test classes with various configurations
- Prepare test content for screen sharing (PPT, PDF)

### Environment
- Test on local development first
- Test on staging/production environment
- Monitor server logs during testing
- Use browser console for client-side debugging

### Reporting
- Document all failures with screenshots
- Include browser console errors
- Include server log errors
- Note exact steps to reproduce issues
- Record test environment details (OS, browser version, etc.)

---

## Automated Testing Recommendations

Consider implementing automated tests for:
1. API endpoint testing (using Jest/Mocha)
2. WebRTC connection tests
3. Database operations
4. Authentication flows
5. Recording upload/download
6. Institute API endpoints

---

## Sign-off

| Role | Name | Signature | Date |
|------|------|-----------|------|
| QA Lead | | | |
| Developer | | | |
| Product Manager | | | |

