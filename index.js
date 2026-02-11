/**
 * PicGo Plugin for Backblaze B2 Cloud Storage
 * 
 * This plugin allows PicGo to upload images to Backblaze B2 buckets.
 * 
 * 支持功能:
 * - CLI 版本: 基础上传功能
 * - GUI 版本: 上传 + 相册删除同步 + 云端文件管理
 */

const crypto = require('crypto');

// 加载 GUI 功能模块（仅在 GUI 版本时生效）
let guiModule;
try {
  guiModule = require('./gui.js');
} catch (err) {
  // CLI 版本可能没有 gui.js 依赖，忽略错误
}

/**
 * Calculate SHA1 hash of buffer
 * @param {Buffer} buffer 
 * @returns {string} SHA1 hash in hex
 */
function sha1(buffer) {
  return crypto.createHash('sha1').update(buffer).digest('hex');
}

/**
 * Generate a unique filename to avoid conflicts
 * @param {string} originalName 
 * @returns {string}
 */
function generateUniqueFileName(originalName) {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8);
  const ext = originalName.substring(originalName.lastIndexOf('.'));
  const baseName = originalName.substring(0, originalName.lastIndexOf('.'));
  return `${baseName}_${timestamp}_${randomStr}${ext}`;
}

/**
 * Parse response from PicGo's request utility
 * PicGo may return:
 * - Direct JSON object on success
 * - Error object with status/statusCode on failure
 */
/**
 * Parse response from PicGo's request utility
 * PicGo returns direct JSON body on success, error object on failure
 */
function parseResponse(result) {
  if (typeof result === 'object' && result !== null) {
    // Check if this is an error response with statusCode
    const statusCode = result.statusCode || result.status;
    
    if (statusCode && (statusCode < 200 || statusCode >= 300)) {
      let body = result.body || result.data || result;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch (e) {}
      }
      return { statusCode, body };
    }
    
    // Check if result has body/data (axios-style wrapper)
    if (result.body !== undefined || result.data !== undefined) {
      let body = result.body || result.data;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch (e) {}
      }
      return { statusCode: 200, body };
    }
    
    // Otherwise, result is the body itself (direct response)
    return { statusCode: 200, body: result };
  }
  
  return { statusCode: undefined, body: result };
}

/**
 * Authorize with B2 and get API URL and auth token
 * @param {string} applicationKeyId 
 * @param {string} applicationKey 
 * @param {Object} request - PicGo's request utility
 * @param {Object} log - PicGo's logger
 * @returns {Promise<Object>} { apiUrl, authToken, downloadUrl }
 */
async function authorizeAccount(applicationKeyId, applicationKey, request, log) {
  const authString = Buffer.from(`${applicationKeyId}:${applicationKey}`).toString('base64');
  
  log.info('[B2] Authorizing...');
  
  let result;
  try {
    result = await request({
      method: 'GET',
      url: 'https://api.backblazeb2.com/b2api/v4/b2_authorize_account',
      headers: {
        'Authorization': `Basic ${authString}`
      },
      json: true
    });
  } catch (err) {
    throw new Error(`Authorization request failed: ${err.message}`);
  }

  const { statusCode, body } = parseResponse(result);
  
  if (statusCode !== 200) {
    const errorMsg = body && typeof body === 'object' ? body.message : 'Unknown error';
    throw new Error(`Authorization failed: ${errorMsg}`);
  }

  if (!body || typeof body !== 'object') {
    throw new Error('Authorization response is empty or invalid');
  }

  // B2 API v4 structure: apiInfo.storageApi.{apiUrl,downloadUrl}
  const storageApi = body.apiInfo?.storageApi;
  const apiUrl = storageApi?.apiUrl;
  const downloadUrl = storageApi?.downloadUrl;
  const authToken = body.authorizationToken;

  if (!apiUrl || !authToken) {
    throw new Error('Authorization response missing apiUrl or authorizationToken');
  }

  return {
    apiUrl,
    authToken,
    downloadUrl: downloadUrl || apiUrl,
    allowed: body.allowed
  };
}

/**
 * Get upload URL for a bucket
 * @param {string} apiUrl 
 * @param {string} authToken 
 * @param {string} bucketId 
 * @param {Object} request - PicGo's request utility
 * @param {Object} log - PicGo's logger
 * @returns {Promise<Object>} { uploadUrl, uploadAuthToken }
 */
async function getUploadUrl(apiUrl, authToken, bucketId, request, log) {
  let result;
  try {
    result = await request({
      method: 'POST',
      url: `${apiUrl}/b2api/v4/b2_get_upload_url`,
      headers: {
        'Authorization': authToken,
        'Content-Type': 'application/json'
      },
      body: {
        bucketId: bucketId
      },
      json: true
    });
  } catch (err) {
    throw new Error(`Get upload URL failed: ${err.message}`);
  }

  const { statusCode, body } = parseResponse(result);

  if (statusCode !== 200) {
    const errorMsg = body && typeof body === 'object' ? body.message : 'Unknown error';
    throw new Error(`Failed to get upload URL: ${errorMsg}`);
  }

  return {
    uploadUrl: body.uploadUrl,
    uploadAuthToken: body.authorizationToken
  };
}

/**
 * Upload file to B2
 * @param {string} uploadUrl 
 * @param {string} uploadAuthToken 
 * @param {Buffer} fileBuffer 
 * @param {string} fileName 
 * @param {string} contentType 
 * @param {Object} request - PicGo's request utility
 * @param {Object} log - PicGo's logger
 * @returns {Promise<Object>}
 */
async function uploadFile(uploadUrl, uploadAuthToken, fileBuffer, fileName, contentType, request, log) {
  const fileSha1 = sha1(fileBuffer);
  
  log.info(`[B2] Uploading ${fileName} (${(fileBuffer.length / 1024).toFixed(2)} KB)...`);
  
  let result;
  try {
    result = await request({
      method: 'POST',
      url: uploadUrl,
      headers: {
        'Authorization': uploadAuthToken,
        'X-Bz-File-Name': encodeURIComponent(fileName),
        'Content-Type': contentType || 'application/octet-stream',
        'X-Bz-Content-Sha1': fileSha1,
        'Content-Length': fileBuffer.length
      },
      body: fileBuffer,
      json: true
    });
  } catch (err) {
    throw new Error(`Upload failed: ${err.message}`);
  }

  const { statusCode, body } = parseResponse(result, log);

  if (statusCode !== 200) {
    const errorMsg = body && typeof body === 'object' ? body.message : 'Unknown error';
    throw new Error(`Upload failed: ${errorMsg}`);
  }

  return body;
}

/**
 * Build public URL for uploaded file
 * @param {string} downloadUrl 
 * @param {string} bucketName 
 * @param {string} fileName 
 * @param {string} customDomain 
 * @returns {string}
 */
function buildFileUrl(downloadUrl, bucketName, fileName, customDomain) {
  if (customDomain) {
    const domain = customDomain.endsWith('/') ? customDomain.slice(0, -1) : customDomain;
    return `${domain}/${encodeURIComponent(fileName)}`;
  }
  return `${downloadUrl}/file/${bucketName}/${encodeURIComponent(fileName)}`;
}

/**
 * Main upload handler
 * @param {Object} ctx - PicGo context
 * @returns {Promise<Object>}
 */
const handle = async (ctx) => {
  const config = ctx.getConfig('picBed.b2');
  
  if (!config) {
    ctx.emit('notification', {
      title: 'B2 Upload Error',
      body: 'Missing B2 configuration'
    });
    throw new Error('B2 configuration not found');
  }

  const { 
    applicationKeyId, 
    applicationKey, 
    bucketId, 
    bucketName,
    customDomain,
    pathPrefix = ''
  } = config;

  if (!applicationKeyId || !applicationKey || !bucketId || !bucketName) {
    ctx.emit('notification', {
      title: 'B2 Upload Error',
      body: 'Missing required configuration: applicationKeyId, applicationKey, bucketId, or bucketName'
    });
    throw new Error('Missing required B2 configuration');
  }

  try {
    // Step 1: Authorize account
    const auth = await authorizeAccount(applicationKeyId, applicationKey, ctx.request, ctx.log);

    // Step 2: Get upload URL
    const uploadInfo = await getUploadUrl(auth.apiUrl, auth.authToken, bucketId, ctx.request, ctx.log);

    // Step 3: Upload each file
    const output = ctx.output;
    for (let i = 0; i < output.length; i++) {
      const item = output[i];
      const buffer = item.buffer;
      const fileName = item.fileName;
      
      if (!buffer) {
        ctx.log.error(`[B2] No buffer found for file: ${fileName}`);
        continue;
      }

      // Generate unique filename with optional path prefix
      let uploadFileName = generateUniqueFileName(fileName);
      if (pathPrefix) {
        const prefix = pathPrefix.endsWith('/') ? pathPrefix : `${pathPrefix}/`;
        uploadFileName = prefix + uploadFileName;
      }

      ctx.log.info(`[B2] Preparing to upload: ${uploadFileName}`);

      // Determine content type from file extension
      const ext = item.extname?.toLowerCase() || '';
      const contentTypeMap = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.svg': 'image/svg+xml',
        '.bmp': 'image/bmp',
        '.ico': 'image/x-icon'
      };
      const contentType = contentTypeMap[ext] || 'application/octet-stream';

      // Upload the file
      const uploadResult = await uploadFile(
        uploadInfo.uploadUrl,
        uploadInfo.uploadAuthToken,
        buffer,
        uploadFileName,
        contentType,
        ctx.request,
        ctx.log
      );

      // Build file URL
      const fileUrl = buildFileUrl(auth.downloadUrl, bucketName, uploadFileName, customDomain);

      item.imgUrl = fileUrl;
      item.url = fileUrl;

      ctx.log.info(`[B2] Successfully uploaded: ${fileUrl}`);
    }

    return ctx;
  } catch (err) {
    ctx.log.error(`[B2] Upload error: ${err.message}`);
    ctx.emit('notification', {
      title: 'B2 Upload Error',
      body: err.message
    });
    throw err;
  }
};

/**
 * Configuration for the plugin
 * @param {Object} ctx - PicGo context
 * @returns {Array}
 */
const config = (ctx) => {
  const userConfig = ctx.getConfig('picBed.b2') || {};
  
  return [
    {
      name: 'applicationKeyId',
      type: 'input',
      alias: 'Application Key ID',
      default: userConfig.applicationKeyId || '',
      required: true,
      message: 'Your B2 Application Key ID (or Account ID)'
    },
    {
      name: 'applicationKey',
      type: 'input',
      alias: 'Application Key',
      default: userConfig.applicationKey || '',
      required: true,
      message: 'Your B2 Application Key (secret)'
    },
    {
      name: 'bucketId',
      type: 'input',
      alias: 'Bucket ID',
      default: userConfig.bucketId || '',
      required: true,
      message: 'Your B2 Bucket ID'
    },
    {
      name: 'bucketName',
      type: 'input',
      alias: 'Bucket Name',
      default: userConfig.bucketName || '',
      required: true,
      message: 'Your B2 Bucket Name'
    },
    {
      name: 'customDomain',
      type: 'input',
      alias: 'Custom Domain (Optional)',
      default: userConfig.customDomain || '',
      required: false,
      message: 'Custom domain for file URLs (e.g., https://cdn.example.com)'
    },
    {
      name: 'pathPrefix',
      type: 'input',
      alias: 'Path Prefix (Optional)',
      default: userConfig.pathPrefix || '',
      required: false,
      message: 'Path prefix for uploaded files (e.g., images/2024)'
    }
  ];
};

/**
 * Plugin registration
 * @param {Object} ctx - PicGo context
 */
const register = (ctx) => {
  ctx.helper.uploader.register('b2', {
    handle,
    config,
    name: 'Backblaze B2'
  });

  // 注册 GUI 功能（如果有）
  if (guiModule && guiModule.registerRemoveListener) {
    try {
      guiModule.registerRemoveListener(ctx);
    } catch (err) {
      ctx.log.warn('[B2] GUI 功能注册失败:', err.message);
    }
  }
};

module.exports = (ctx) => {
  const result = {
    register,
    uploader: 'b2'
  };

  // 添加 GUI 菜单（如果有）
  if (guiModule && guiModule.guiMenu) {
    result.guiMenu = guiModule.guiMenu;
  }

  // 添加快捷键支持（如果有）
  if (guiModule && guiModule.commands) {
    result.commands = guiModule.commands;
  }

  return result;
};
