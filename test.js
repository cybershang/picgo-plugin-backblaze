/**
 * 测试脚本 - 用于本地测试 B2 上传逻辑
 * 
 * 使用方法:
 * 1. 复制 .env.json.example 为 .env.json
 * 2. 在 .env.json 中配置你的 B2 凭证
 * 3. 运行: node test.js /path/to/image.png
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const { URL } = require('url');

// ============ 工具函数 ============

function sha1(buffer) {
  return crypto.createHash('sha1').update(buffer).digest('hex');
}

function generateUniqueFileName(originalName) {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8);
  const ext = originalName.substring(originalName.lastIndexOf('.'));
  const baseName = originalName.substring(0, originalName.lastIndexOf('.'));
  return `${baseName}_${timestamp}_${randomStr}${ext}`;
}

// ============ HTTP 请求封装 ============

function makeRequest(options) {
  return new Promise((resolve, reject) => {
    const url = new URL(options.url);
    
    const reqOptions = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    console.log(`[HTTP] ${reqOptions.method} ${url.hostname}${reqOptions.path}`);

    const req = https.request(reqOptions, (res) => {
      let data = Buffer.alloc(0);
      res.on('data', (chunk) => data = Buffer.concat([data, chunk]));
      res.on('end', () => {
        try {
          const body = JSON.parse(data.toString());
          resolve({ statusCode: res.statusCode, body, headers: res.headers });
        } catch {
          resolve({ statusCode: res.statusCode, body: data.toString(), headers: res.headers });
        }
      });
    });

    req.on('error', (err) => {
      console.error(`[HTTP Error] ${err.message}`);
      reject(err);
    });
    
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (options.body) {
      req.write(options.body);
    }
    
    req.end();
  });
}

// ============ B2 API 函数 ============

async function authorizeAccount(applicationKeyId, applicationKey) {
  console.log('[B2] 正在授权...');
  const authString = Buffer.from(`${applicationKeyId}:${applicationKey}`).toString('base64');
  
  const result = await makeRequest({
    method: 'GET',
    url: 'https://api.backblazeb2.com/b2api/v4/b2_authorize_account',
    headers: {
      'Authorization': `Basic ${authString}`
    }
  });

  if (result.statusCode !== 200) {
    throw new Error(`授权失败: ${result.body.message || '未知错误'}`);
  }

  console.log('[B2] 授权成功!');
  console.log(`  API URL: ${result.body.apiUrl}`);
  console.log(`  Download URL: ${result.body.downloadUrl}`);
  
  return {
    apiUrl: result.body.apiUrl,
    authToken: result.body.authorizationToken,
    downloadUrl: result.body.downloadUrl
  };
}

async function getUploadUrl(apiUrl, authToken, bucketId) {
  console.log('[B2] 正在获取上传 URL...');
  
  const result = await makeRequest({
    method: 'POST',
    url: `${apiUrl}/b2api/v4/b2_get_upload_url`,
    headers: {
      'Authorization': authToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ bucketId })
  });

  if (result.statusCode !== 200) {
    throw new Error(`获取上传 URL 失败: ${result.body.message || '未知错误'}`);
  }

  console.log('[B2] 获取上传 URL 成功!');
  return {
    uploadUrl: result.body.uploadUrl,
    uploadAuthToken: result.body.authorizationToken
  };
}

async function uploadFile(uploadUrl, uploadAuthToken, fileBuffer, fileName, contentType) {
  console.log(`[B2] 正在上传文件: ${fileName}`);
  console.log(`  大小: ${(fileBuffer.length / 1024).toFixed(2)} KB`);
  
  const fileSha1 = sha1(fileBuffer);
  
  const url = new URL(uploadUrl);
  
  const result = await new Promise((resolve, reject) => {
    const reqOptions = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Authorization': uploadAuthToken,
        'X-Bz-File-Name': encodeURIComponent(fileName),
        'Content-Type': contentType || 'application/octet-stream',
        'X-Bz-Content-Sha1': fileSha1,
        'Content-Length': fileBuffer.length
      }
    };

    const req = https.request(reqOptions, (res) => {
      let data = Buffer.alloc(0);
      res.on('data', (chunk) => data = Buffer.concat([data, chunk]));
      res.on('end', () => {
        try {
          const body = JSON.parse(data.toString());
          resolve({ statusCode: res.statusCode, body });
        } catch {
          resolve({ statusCode: res.statusCode, body: data.toString() });
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(60000, () => {
      req.destroy();
      reject(new Error('Upload timeout'));
    });

    req.write(fileBuffer);
    req.end();
  });

  if (result.statusCode !== 200) {
    throw new Error(`上传失败: ${result.body.message || '未知错误'}`);
  }

  console.log('[B2] 上传成功!');
  return result.body;
}

function buildFileUrl(downloadUrl, bucketName, fileName, customDomain) {
  if (customDomain) {
    const domain = customDomain.endsWith('/') ? customDomain.slice(0, -1) : customDomain;
    return `${domain}/${encodeURIComponent(fileName)}`;
  }
  return `${downloadUrl}/file/${bucketName}/${encodeURIComponent(fileName)}`;
}

// ============ 主程序 ============

async function main() {
  const imagePath = process.argv[2];
  
  if (!imagePath) {
    console.error('用法: node test.js <图片路径>');
    process.exit(1);
  }

  if (!fs.existsSync(imagePath)) {
    console.error(`错误: 找不到文件 ${imagePath}`);
    process.exit(1);
  }

  // 读取配置
  const configPath = path.join(__dirname, '.env.json');
  if (!fs.existsSync(configPath)) {
    console.error('错误: 找不到 .env.json 配置文件');
    console.log('\n请复制 .env.json.example 为 .env.json 并填写你的 B2 凭证');
    process.exit(1);
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  
  // 验证配置
  const required = ['applicationKeyId', 'applicationKey', 'bucketId', 'bucketName'];
  for (const key of required) {
    if (!config[key]) {
      console.error(`错误: 配置缺少必填项: ${key}`);
      process.exit(1);
    }
  }

  const buffer = fs.readFileSync(imagePath);
  const fileName = path.basename(imagePath);
  const extname = path.extname(fileName).toLowerCase();

  console.log('\n========================================');
  console.log('PicGo B2 Plugin Test');
  console.log('========================================\n');
  
  console.log('配置信息:');
  console.log(`  Bucket: ${config.bucketName}`);
  console.log(`  Bucket ID: ${config.bucketId}`);
  console.log(`  自定义域名: ${config.customDomain || '无'}`);
  console.log(`  路径前缀: ${config.pathPrefix || '无'}`);
  console.log('');
  
  console.log('文件信息:');
  console.log(`  名称: ${fileName}`);
  console.log(`  大小: ${(buffer.length / 1024).toFixed(2)} KB`);
  console.log(`  扩展名: ${extname}`);
  console.log('');

  try {
    // Step 1: 授权
    const auth = await authorizeAccount(config.applicationKeyId, config.applicationKey);

    // Step 2: 获取上传 URL
    const uploadInfo = await getUploadUrl(auth.apiUrl, auth.authToken, config.bucketId);

    // Step 3: 准备文件名
    let uploadFileName = generateUniqueFileName(fileName);
    if (config.pathPrefix) {
      const prefix = config.pathPrefix.endsWith('/') ? config.pathPrefix : `${config.pathPrefix}/`;
      uploadFileName = prefix + uploadFileName;
    }

    // 确定 Content-Type
    const contentTypeMap = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
      '.bmp': 'image/bmp',
      '.ico': 'image/x-icon',
      '.md': 'text/markdown'
    };
    const contentType = contentTypeMap[extname] || 'application/octet-stream';

    // Step 4: 上传文件
    await uploadFile(uploadInfo.uploadUrl, uploadInfo.uploadAuthToken, buffer, uploadFileName, contentType);

    // Step 5: 构建 URL
    const fileUrl = buildFileUrl(auth.downloadUrl, config.bucketName, uploadFileName, config.customDomain);

    console.log('\n========================================');
    console.log('上传成功!');
    console.log('========================================');
    console.log(`文件 URL: ${fileUrl}`);
    console.log('');

  } catch (err) {
    console.log('\n========================================');
    console.log('上传失败!');
    console.log('========================================');
    console.error(`错误: ${err.message}`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('未捕获的错误:', err);
  process.exit(1);
});
