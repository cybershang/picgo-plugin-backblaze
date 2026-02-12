#!/usr/bin/env node

/**
 * Black-box test for picgo-plugin-backblaze
 * 
 * Test flow:
 * 1. Check if picgo CLI is installed
 * 2. Read configuration from .env.json
 * 3. Calculate SHA256 hash of test file (logo.png)
 * 4. Configure picgo uploader with B2 settings
 * 5. Upload file via picgo upload command
 * 6. Download the returned URL and verify hash
 * 
 * Exit codes:
 * 0 - All tests passed
 * 1 - Environment/config error
 * 2 - Upload failed
 * 3 - Verification failed (hash mismatch)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const TEST_FILE = './logo.png';
const ENV_FILE = './.env.json';
const CONFIG_NAME = 'b2';

/**
 * Calculate SHA256 hash of a file
 * @param {string} filePath 
 * @returns {string} hex hash
 */
function calculateHash(filePath) {
  const buffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Download file from URL and calculate hash
 * @param {string} url 
 * @returns {Promise<string>} hex hash
 */
async function downloadAndHash(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download: ${response.status} ${response.statusText}`);
  }
  const buffer = await response.arrayBuffer();
  return crypto.createHash('sha256').update(Buffer.from(buffer)).digest('hex');
}

/**
 * Check if picgo CLI is installed
 * @returns {boolean}
 */
function isPicgoInstalled() {
  try {
    execSync('picgo --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Configure picgo uploader with B2 settings
 * @param {Object} config 
 */
function configurePicgo(config) {
  const configCmd = `picgo set uploader ${CONFIG_NAME}`;
  
  // Build config string for picgo set command
  // picgo set uploader b2 will prompt for each field interactively
  // We use echo and pipe to provide answers
  const answers = [
    config.applicationKeyId,
    config.applicationKey,
    config.bucketId,
    config.bucketName,
    config.customDomain || '',
    config.pathPrefix || '',
    'y'  // confirm
  ].join('\n');
  
  try {
    execSync(`echo "${answers}" | ${configCmd}`, { 
      stdio: 'pipe',
      encoding: 'utf-8',
      timeout: 30000
    });
  } catch (error) {
    // picgo set might have different interactive flow, let's try an alternative approach
    // Write config directly to picgo config file
    const os = require('os');
    const picgoConfigDir = path.join(os.homedir(), '.picgo');
    const picgoConfigPath = path.join(picgoConfigDir, 'config.json');
    
    let picgoConfig = {};
    if (fs.existsSync(picgoConfigPath)) {
      picgoConfig = JSON.parse(fs.readFileSync(picgoConfigPath, 'utf-8'));
    }
    
    // Ensure directory exists
    if (!fs.existsSync(picgoConfigDir)) {
      fs.mkdirSync(picgoConfigDir, { recursive: true });
    }
    
    // Set uploader config
    picgoConfig.uploader = CONFIG_NAME;
    picgoConfig[CONFIG_NAME] = config;
    
    fs.writeFileSync(picgoConfigPath, JSON.stringify(picgoConfig, null, 2));
    
    console.log('✓ PicGo configured via config file');
    console.log(`   Config path: ${picgoConfigPath}`);
    console.log('   Config content (without secrets):');
    const displayConfig = { ...picgoConfig };
    if (displayConfig.b2) {
      displayConfig.b2 = { 
        ...displayConfig.b2, 
        applicationKeyId: '***', 
        applicationKey: '***' 
      };
    }
    console.log(JSON.stringify(displayConfig, null, 2).split('\n').map(l => '     ' + l).join('\n'));
  }
}

/**
 * Upload file via picgo
 * @param {string} filePath 
 * @returns {string} uploaded URL
 */
function uploadFile(filePath) {
  try {
    console.log('   Executing: picgo -d upload "${filePath}"');
    
    const output = execSync(`picgo -d upload "${filePath}"`, {
      encoding: 'utf-8',
      timeout: 60000,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    // Debug: show last 20 lines of output
    console.log('   Output (last 20 lines):');
    const lines = output.trim().split('\n');
    lines.slice(-20).forEach(l => console.log('     ' + l));
    
    // Parse output to find URL
    // Look for URL after [PicGo SUCCESS]: or any standalone URL line
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Check for [PicGo SUCCESS] marker - URL is on next line
      if (line.includes('[PicGo SUCCESS]') && i + 1 < lines.length) {
        const nextLine = lines[i + 1].trim();
        if (nextLine.startsWith('http://') || nextLine.startsWith('https://')) {
          return nextLine;
        }
      }
      
      // Direct URL match
      if (line.startsWith('http://') || line.startsWith('https://')) {
        return line;
      }
    }
    
    // Fallback: regex match
    const urlMatch = output.match(/(https?:\/\/[^\s]+)/);
    if (urlMatch) {
      return urlMatch[1];
    }
    
    throw new Error(`Could not parse URL from output. Full output:\n${output}`);
  } catch (error) {
    console.error('   Upload error details:');
    if (error.stdout) {
      console.error('   STDOUT:', error.stdout);
    }
    if (error.stderr) {
      console.error('   STDERR:', error.stderr);
    }
    console.error('   Message:', error.message);
    throw error;
  }
}

/**
 * Main test runner
 */
async function main() {
  console.log('========================================');
  console.log('  PicGo Backblaze B2 Plugin Test');
  console.log('========================================\n');
  
  // Step 1: Check picgo installation
  console.log('Step 1: Checking PicGo CLI installation...');
  if (!isPicgoInstalled()) {
    console.error('❌ PicGo CLI is not installed.');
    console.error('   Please install it first: npm install -g picgo');
    process.exit(1);
  }
  console.log('✓ PicGo CLI is installed\n');
  
  // Step 2: Read configuration
  console.log('Step 2: Reading configuration...');
  if (!fs.existsSync(ENV_FILE)) {
    console.error(`❌ Configuration file not found: ${ENV_FILE}`);
    console.error('   Please copy .env.json.example to .env.json and fill in your credentials');
    process.exit(1);
  }
  
  let config;
  try {
    config = JSON.parse(fs.readFileSync(ENV_FILE, 'utf-8'));
    const required = ['applicationKeyId', 'applicationKey', 'bucketId', 'bucketName'];
    for (const key of required) {
      if (!config[key]) {
        throw new Error(`Missing required config: ${key}`);
      }
    }
  } catch (error) {
    console.error('❌ Failed to parse configuration:', error.message);
    process.exit(1);
  }
  console.log('✓ Configuration loaded\n');
  
  // Step 3: Check test file
  console.log('Step 3: Checking test file...');
  if (!fs.existsSync(TEST_FILE)) {
    console.error(`❌ Test file not found: ${TEST_FILE}`);
    process.exit(1);
  }
  console.log(`✓ Test file found: ${TEST_FILE}\n`);
  
  // Step 4: Calculate original file hash
  console.log('Step 4: Calculating original file hash...');
  const originalHash = calculateHash(TEST_FILE);
  console.log(`   SHA256: ${originalHash}`);
  console.log('✓ Hash calculated\n');
  
  // Step 5: Configure PicGo
  console.log('Step 5: Configuring PicGo uploader...');
  configurePicgo(config);
  console.log('✓ Configuration complete\n');
  
  // Step 6: Upload file
  console.log('Step 6: Uploading file to Backblaze B2...');
  let uploadedUrl;
  try {
    uploadedUrl = uploadFile(TEST_FILE);
    console.log(`   URL: ${uploadedUrl}`);
    console.log('✓ Upload successful\n');
  } catch (error) {
    console.error('❌ Upload failed:', error.message);
    process.exit(2);
  }
  
  // Step 7: Download and verify
  console.log('Step 7: Downloading and verifying uploaded file...');
  try {
    const downloadedHash = await downloadAndHash(uploadedUrl);
    console.log(`   Original:  ${originalHash}`);
    console.log(`   Downloaded: ${downloadedHash}`);
    
    if (originalHash === downloadedHash) {
      console.log('✓ Hash match - File integrity verified!\n');
    } else {
      console.error('❌ Hash mismatch! File may be corrupted.\n');
      process.exit(3);
    }
  } catch (error) {
    console.error('❌ Verification failed:', error.message);
    process.exit(3);
  }
  
  // Success
  console.log('========================================');
  console.log('  🎉 All tests passed successfully!');
  console.log('========================================');
  console.log(`\nUploaded file: ${uploadedUrl}`);
  console.log(`Path prefix: ${config.pathPrefix || '(none)'}`);
  console.log(`Bucket: ${config.bucketName}\n`);
  
  process.exit(0);
}

// Run main
main().catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
