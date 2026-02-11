/**
 * PicGo Plugin for Backblaze B2 Cloud Storage
 * 
 * This plugin allows PicGo to upload images to Backblaze B2 buckets.
 */

const crypto = require('crypto');

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
 * Authorize with B2 and get API URL and auth token
 * @param {string} applicationKeyId 
 * @param {string} applicationKey 
 * @param {Object} request - PicGo's request utility
 * @returns {Promise<Object>} { apiUrl, authToken, downloadUrl }
 */
async function authorizeAccount(applicationKeyId, applicationKey, request, log) {
  const authString = Buffer.from(`${applicationKeyId}:${applicationKey}`).toString('base64');
  
  log.info('[B2] Sending authorization request...');
  
  const result = await request({
    method: 'GET',
    url: 'https://api.backblazeb2.com/b2api/v4/b2_authorize_account',
    headers: {
      'Authorization': `Basic ${authString}`
    },
    json: true
  });

  log.info(`[B2] Authorization response status: ${result.statusCode}`);
  
  // Debug: log response structure (remove in production)
  if (result.statusCode !== 200) {
    const errorMsg = result.body && typeof result.body === 'object' 
      ? result.body.message 
      : 'Unknown error';
    throw new Error(`B2 authorization failed: ${errorMsg}`);
  }

  if (!result.body || typeof result.body !== 'object') {
    throw new Error('B2 authorization response is empty or invalid');
  }

  // B2 API v4 structure: apiInfo.storageApi.{apiUrl,downloadUrl}
  const storageApi = result.body.apiInfo?.storageApi;
  const apiUrl = storageApi?.apiUrl;
  const downloadUrl = storageApi?.downloadUrl;
  const authToken = result.body.authorizationToken;

  if (!apiUrl || !authToken) {
    log.error('[B2] Authorization response missing fields:', JSON.stringify(result.body, null, 2));
    throw new Error('B2 authorization response missing apiUrl or authorizationToken');
  }

  return {
    apiUrl,
    authToken,
    downloadUrl: downloadUrl || apiUrl, // fallback to apiUrl if downloadUrl not provided
    allowed: result.body.allowed
  };
}

/**
 * Get upload URL for a bucket
 * @param {string} apiUrl 
 * @param {string} authToken 
 * @param {string} bucketId 
 * @param {Object} request - PicGo's request utility
 * @returns {Promise<Object>} { uploadUrl, uploadAuthToken }
 */
async function getUploadUrl(apiUrl, authToken, bucketId, request) {
  const result = await request({
    method: 'POST',
    url: `${apiUrl}/b2api/v4/b2_get_upload_url`,
    headers: {
      'Authorization': authToken
    },
    body: {
      bucketId: bucketId
    },
    json: true
  });

  if (result.statusCode !== 200) {
    const errorMsg = result.body && typeof result.body === 'object' 
      ? result.body.message 
      : 'Unknown error';
    throw new Error(`Failed to get upload URL: ${errorMsg}`);
  }

  return {
    uploadUrl: result.body.uploadUrl,
    uploadAuthToken: result.body.authorizationToken
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
 * @returns {Promise<Object>}
 */
async function uploadFile(uploadUrl, uploadAuthToken, fileBuffer, fileName, contentType, request) {
  const fileSha1 = sha1(fileBuffer);
  
  const result = await request({
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

  if (result.statusCode !== 200) {
    const errorMsg = result.body && typeof result.body === 'object' 
      ? result.body.message 
      : 'Unknown error';
    throw new Error(`Upload failed: ${errorMsg}`);
  }

  return result.body;
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
  // If custom domain is provided, use it
  if (customDomain) {
    const domain = customDomain.endsWith('/') ? customDomain.slice(0, -1) : customDomain;
    return `${domain}/${encodeURIComponent(fileName)}`;
  }
  // Otherwise use B2's native URL format
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
    ctx.log.info('[B2] Authorizing account...');
    const auth = await authorizeAccount(applicationKeyId, applicationKey, ctx.request, ctx.log);
    ctx.log.info('[B2] Authorization successful');

    // Step 2: Get upload URL
    ctx.log.info('[B2] Getting upload URL...');
    const uploadInfo = await getUploadUrl(auth.apiUrl, auth.authToken, bucketId, ctx.request);
    ctx.log.info('[B2] Got upload URL');

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

      ctx.log.info(`[B2] Uploading ${fileName} as ${uploadFileName}...`);

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
        ctx.request
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
};

module.exports = (ctx) => {
  return {
    register,
    uploader: 'b2'
  };
};
