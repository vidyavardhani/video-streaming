/**
 * API Test Suite for Video Streaming Platform
 * Run with: npm test or node tests/api.test.js
 */

const http = require('http');
const https = require('https');

const BASE_URL = process.env.TEST_URL || 'http://localhost:4000';
let authToken = null;
let testClassCode = null;

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function makeRequest(method, path, data = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const client = url.protocol === 'https:' ? https : http;
    
    const options = {
      method,
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    const req = client.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = body ? JSON.parse(body) : {};
          resolve({ status: res.statusCode, data: parsed, headers: res.headers });
        } catch (e) {
          resolve({ status: res.statusCode, data: body, headers: res.headers });
        }
      });
    });

    req.on('error', reject);
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

async function runTest(name, testFn) {
  try {
    log(`\n🧪 Running: ${name}`, 'blue');
    await testFn();
    log(`✅ PASS: ${name}`, 'green');
    return true;
  } catch (error) {
    log(`❌ FAIL: ${name}`, 'red');
    log(`   Error: ${error.message}`, 'red');
    return false;
  }
}

// Test Cases

async function testServerRunning() {
  const res = await makeRequest('GET', '/');
  if (res.status !== 200 && res.status !== 302) {
    throw new Error(`Server not responding properly. Status: ${res.status}`);
  }
}

async function testRegisterWithInstitute() {
  const userData = {
    name: 'Test Teacher',
    email: `teacher_${Date.now()}@test.com`,
    password: 'test123456',
    role: 'teacher',
    institute: 'Test University',
    location: 'Test City, TS'
  };
  
  const res = await makeRequest('POST', '/auth/register', userData);
  
  if (res.status !== 201) {
    throw new Error(`Registration failed. Status: ${res.status}, Message: ${res.data.message}`);
  }
  
  if (!res.data.token) {
    throw new Error('No token received after registration');
  }
  
  authToken = res.data.token;
  log(`   Token received: ${authToken.substring(0, 20)}...`, 'yellow');
}

async function testGetProfile() {
  const res = await makeRequest('GET', '/auth/me', null, {
    'Cookie': `vs_token=${authToken}`
  });
  
  if (res.status !== 200) {
    throw new Error(`Get profile failed. Status: ${res.status}`);
  }
  
  if (!res.data.institute) {
    throw new Error('Institute field missing from profile');
  }
  
  if (!res.data.location) {
    throw new Error('Location field missing from profile');
  }
  
  log(`   Institute: ${res.data.institute}`, 'yellow');
  log(`   Location: ${res.data.location}`, 'yellow');
}

async function testUpdateProfile() {
  const updates = {
    institute: 'Updated University',
    location: 'New City, NC'
  };
  
  const res = await makeRequest('PATCH', '/auth/update-profile', updates, {
    'Cookie': `vs_token=${authToken}`
  });
  
  if (res.status !== 200) {
    throw new Error(`Profile update failed. Status: ${res.status}`);
  }
  
  if (res.data.user.institute !== updates.institute) {
    throw new Error('Institute not updated correctly');
  }
}

async function testListInstitutes() {
  const res = await makeRequest('GET', '/admin/institutes', null, {
    'Cookie': `vs_token=${authToken}`
  });
  
  if (res.status !== 200) {
    throw new Error(`List institutes failed. Status: ${res.status}`);
  }
  
  if (!Array.isArray(res.data.institutes)) {
    throw new Error('Institutes array not returned');
  }
  
  if (!Array.isArray(res.data.locations)) {
    throw new Error('Locations array not returned');
  }
  
  log(`   Found ${res.data.institutes.length} institutes`, 'yellow');
  log(`   Found ${res.data.locations.length} locations`, 'yellow');
}

async function testCreateClass() {
  const classData = {
    title: 'Test Class for Recording'
  };
  
  const res = await makeRequest('POST', '/classes', classData, {
    'Cookie': `vs_token=${authToken}`
  });
  
  if (res.status !== 201) {
    throw new Error(`Create class failed. Status: ${res.status}`);
  }
  
  if (!res.data.meetingCode) {
    throw new Error('No meeting code returned');
  }
  
  testClassCode = res.data.meetingCode;
  log(`   Class created: ${testClassCode}`, 'yellow');
}

async function testStartClass() {
  const res = await makeRequest('PATCH', `/classes/${testClassCode}/start`, null, {
    'Cookie': `vs_token=${authToken}`
  });
  
  if (res.status !== 200) {
    throw new Error(`Start class failed. Status: ${res.status}`);
  }
  
  if (res.data.class.status !== 'live') {
    throw new Error('Class status not set to live');
  }
}

async function testGetClassDetails() {
  const res = await makeRequest('GET', `/classes/${testClassCode}`, null, {
    'Cookie': `vs_token=${authToken}`
  });
  
  if (res.status !== 200) {
    throw new Error(`Get class failed. Status: ${res.status}`);
  }
  
  if (!res.data.meetingLink) {
    throw new Error('Meeting link missing');
  }
  
  log(`   Meeting link: ${res.data.meetingLink}`, 'yellow');
}

async function testStudentJoin() {
  const joinData = {
    displayName: 'Test Student'
  };
  
  const res = await makeRequest('POST', `/classes/${testClassCode}/join`, joinData);
  
  if (res.status !== 201) {
    throw new Error(`Student join failed. Status: ${res.status}`);
  }
  
  if (!res.data.joinToken) {
    throw new Error('No join token returned');
  }
  
  log(`   Student join token: ${res.data.joinToken.substring(0, 15)}...`, 'yellow');
}

async function testEndClass() {
  const res = await makeRequest('PATCH', `/classes/${testClassCode}/end`, null, {
    'Cookie': `vs_token=${authToken}`
  });
  
  if (res.status !== 200) {
    throw new Error(`End class failed. Status: ${res.status}`);
  }
  
  log(`   Class ended successfully`, 'yellow');
}

async function testUnauthorizedAccess() {
  const res = await makeRequest('GET', '/admin/institutes');
  
  if (res.status !== 401 && res.status !== 403) {
    throw new Error(`Should have blocked unauthorized access. Got status: ${res.status}`);
  }
}

async function testInvalidRegistration() {
  const userData = {
    name: 'Invalid User',
    email: 'invalid-email',
    password: '123', // too short
    role: 'teacher'
  };
  
  const res = await makeRequest('POST', '/auth/register', userData);
  
  if (res.status === 201) {
    throw new Error('Should have rejected invalid registration');
  }
}

// Main test runner
async function runAllTests() {
  log('\n🚀 Starting API Test Suite', 'blue');
  log('================================\n', 'blue');
  
  const tests = [
    { name: 'Server is running', fn: testServerRunning },
    { name: 'Register with institute/location', fn: testRegisterWithInstitute },
    { name: 'Get user profile with institute', fn: testGetProfile },
    { name: 'Update profile institute/location', fn: testUpdateProfile },
    { name: 'List all institutes', fn: testListInstitutes },
    { name: 'Create class', fn: testCreateClass },
    { name: 'Start class', fn: testStartClass },
    { name: 'Get class details', fn: testGetClassDetails },
    { name: 'Student join class', fn: testStudentJoin },
    { name: 'End class', fn: testEndClass },
    { name: 'Block unauthorized access', fn: testUnauthorizedAccess },
    { name: 'Reject invalid registration', fn: testInvalidRegistration }
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const test of tests) {
    const result = await runTest(test.name, test.fn);
    if (result) {
      passed++;
    } else {
      failed++;
    }
  }
  
  log('\n================================', 'blue');
  log(`\n📊 Test Results:`, 'blue');
  log(`   ✅ Passed: ${passed}`, 'green');
  log(`   ❌ Failed: ${failed}`, failed > 0 ? 'red' : 'green');
  log(`   📈 Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%\n`, 'yellow');
  
  process.exit(failed > 0 ? 1 : 0);
}

// Run tests
if (require.main === module) {
  runAllTests().catch(error => {
    log(`\n💥 Test suite crashed: ${error.message}`, 'red');
    process.exit(1);
  });
}

module.exports = { runAllTests, makeRequest };

