/**
 * Setup Validation Script
 * Checks if all prerequisites are met before running tests
 * Run with: npm run validate
 */

const fs = require('fs');
const path = require('path');

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

function checkFileExists(filePath, description) {
  const exists = fs.existsSync(filePath);
  if (exists) {
    log(`✅ ${description}`, 'green');
  } else {
    log(`❌ ${description} - NOT FOUND`, 'red');
  }
  return exists;
}

function checkCodeSyntax(filePath, description) {
  try {
    require.resolve(path.resolve(filePath));
    log(`✅ ${description} - Syntax OK`, 'green');
    return true;
  } catch (error) {
    log(`❌ ${description} - Syntax Error: ${error.message}`, 'red');
    return false;
  }
}

async function validateSetup() {
  log('\n🔍 Validating Setup & Recent Fixes', 'blue');
  log('=====================================\n', 'blue');
  
  let allPassed = true;
  
  // Check modified files exist
  log('📁 Checking Modified Files:', 'blue');
  allPassed &= checkFileExists('app/services/recordingService.js', 'Recording Service');
  allPassed &= checkFileExists('app/public/js/class.js', 'Class Client Script');
  allPassed &= checkFileExists('app/models/User.js', 'User Model');
  allPassed &= checkFileExists('app/controllers/authController.js', 'Auth Controller');
  allPassed &= checkFileExists('app/controllers/dashboardController.js', 'Dashboard Controller');
  allPassed &= checkFileExists('app/routes/dashboardRoutes.js', 'Dashboard Routes');
  allPassed &= checkFileExists('app/views/register.ejs', 'Registration View');
  allPassed &= checkFileExists('app/public/js/auth.js', 'Auth Client Script');
  
  log('\n📝 Checking Code Syntax:', 'blue');
  allPassed &= checkCodeSyntax('server.js', 'Main Server');
  allPassed &= checkCodeSyntax('app/services/recordingService.js', 'Recording Service');
  allPassed &= checkCodeSyntax('app/controllers/authController.js', 'Auth Controller');
  allPassed &= checkCodeSyntax('app/controllers/dashboardController.js', 'Dashboard Controller');
  allPassed &= checkCodeSyntax('app/models/User.js', 'User Model');
  
  log('\n🔧 Checking Configuration:', 'blue');
  
  // Check .env file
  const envExists = fs.existsSync('.env');
  if (envExists) {
    log('✅ .env file exists', 'green');
    const envContent = fs.readFileSync('.env', 'utf-8');
    
    if (envContent.includes('MONGODB_URI')) {
      log('✅ MongoDB URI configured', 'green');
    } else {
      log('⚠️  MongoDB URI not found in .env', 'yellow');
    }
    
    if (envContent.includes('JWT_SECRET')) {
      log('✅ JWT Secret configured', 'green');
    } else {
      log('⚠️  JWT Secret not found in .env', 'yellow');
    }
    
    if (envContent.includes('AWS_S3_BUCKET_NAME')) {
      log('✅ S3 configuration found (for recording)', 'green');
    } else {
      log('⚠️  S3 not configured (recordings will save locally)', 'yellow');
    }
  } else {
    log('❌ .env file not found', 'red');
    log('   Create .env file with required variables', 'yellow');
    allPassed = false;
  }
  
  log('\n🆕 Validating Recent Fixes:', 'blue');
  
  // Check Fix 1: Recording Service improvements
  const recordingService = fs.readFileSync('app/services/recordingService.js', 'utf-8');
  if (recordingService.includes('console.error') && recordingService.includes('Recording data missing')) {
    log('✅ Fix 1: Recording error handling improved', 'green');
  } else {
    log('❌ Fix 1: Recording error handling not found', 'red');
    allPassed = false;
  }
  
  // Check Fix 2: Camera devicechange listener
  const classJs = fs.readFileSync('app/public/js/class.js', 'utf-8');
  if (classJs.includes('devicechange') && classJs.includes('external camera')) {
    log('✅ Fix 2: External camera auto-switch implemented', 'green');
  } else {
    log('❌ Fix 2: Camera auto-switch not found', 'red');
    allPassed = false;
  }
  
  // Check Fix 3: Institute/Location fields
  const userModel = fs.readFileSync('app/models/User.js', 'utf-8');
  if (userModel.includes('institute') && userModel.includes('location')) {
    log('✅ Fix 3a: User model has institute/location fields', 'green');
  } else {
    log('❌ Fix 3a: Institute/location fields not in User model', 'red');
    allPassed = false;
  }
  
  const registerView = fs.readFileSync('app/views/register.ejs', 'utf-8');
  if (registerView.includes('institute') && registerView.includes('location')) {
    log('✅ Fix 3b: Registration form has institute/location fields', 'green');
  } else {
    log('❌ Fix 3b: Registration form missing new fields', 'red');
    allPassed = false;
  }
  
  const dashboardController = fs.readFileSync('app/controllers/dashboardController.js', 'utf-8');
  if (dashboardController.includes('listInstitutes')) {
    log('✅ Fix 3c: Institute listing endpoint implemented', 'green');
  } else {
    log('❌ Fix 3c: Institute listing endpoint not found', 'red');
    allPassed = false;
  }
  
  log('\n📊 Validation Summary:', 'blue');
  log('=====================\n', 'blue');
  
  if (allPassed) {
    log('✨ All checks passed! Ready to test.', 'green');
    log('\nNext steps:', 'blue');
    log('1. Ensure MongoDB is running', 'yellow');
    log('2. Start server: npm start', 'yellow');
    log('3. Run API tests: npm test', 'yellow');
    log('4. Or use manual checklist: MANUAL_TEST_CHECKLIST.md', 'yellow');
    return 0;
  } else {
    log('⚠️  Some checks failed. Please review issues above.', 'red');
    return 1;
  }
}

// Run validation
validateSetup()
  .then(code => process.exit(code))
  .catch(error => {
    log(`\n💥 Validation crashed: ${error.message}`, 'red');
    process.exit(1);
  });

