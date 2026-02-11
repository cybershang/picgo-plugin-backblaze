/**
 * GUI 功能模块 - 用于 PicGo GUI 版本
 * 
 * 提供以下功能:
 * 1. guiMenu - 插件菜单 (查看 Bucket、删除云端文件等)
 * 2. remove 事件 - 相册删除时同步删除 B2 文件
 * 3. commands - 快捷键支持
 */

const https = require('https');
const { URL } = require('url');

/**
 * 简单的 HTTP 请求封装
 * 用于 GUI 功能中的独立请求
 */
function makeRequest(options) {
  return new Promise((resolve, reject) => {
    const url = new URL(options.url);
    const reqOptions = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method: options.method || 'GET',
      headers: options.headers || {}
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
    req.setTimeout(options.timeout || 30000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

/**
 * 从 URL 中提取文件名
 * B2 URL 格式: https://f004.backblazeb2.com/file/bucket-name/path/to/file.png
 */
function extractFileNameFromUrl(fileUrl, bucketName) {
  try {
    const url = new URL(fileUrl);
    // 路径格式: /file/bucket-name/path/to/file.png
    const pathParts = url.pathname.split('/');
    // 去掉开头的 '' 和 'file' 和 bucketName
    // ['', 'file', 'bucket-name', 'path', 'to', 'file.png']
    if (pathParts.length >= 3 && pathParts[1] === 'file' && pathParts[2] === bucketName) {
      return pathParts.slice(3).join('/');
    }
    // 如果是自定义域名，路径就是完整的
    return url.pathname.substring(1); // 去掉开头的 /
  } catch (err) {
    return null;
  }
}

/**
 * B2 API 授权
 */
async function authorizeB2(config) {
  const { applicationKeyId, applicationKey } = config;
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

  const storageApi = result.body.apiInfo?.storageApi;
  return {
    apiUrl: storageApi?.apiUrl,
    authToken: result.body.authorizationToken,
    downloadUrl: storageApi?.downloadUrl
  };
}

/**
 * 删除 B2 文件
 */
async function deleteB2File(fileName, config, log) {
  if (!fileName) {
    throw new Error('文件名为空');
  }

  log.info(`[B2 GUI] 准备删除文件: ${fileName}`);
  
  // 1. 授权
  const auth = await authorizeB2(config);
  log.info('[B2 GUI] 授权成功');

  // 2. 获取文件版本（删除需要 fileId）
  // 先尝试通过文件名获取 fileId
  const listResult = await makeRequest({
    method: 'POST',
    url: `${auth.apiUrl}/b2api/v4/b2_list_file_names`,
    headers: {
      'Authorization': auth.authToken,
      'Content-Type': 'application/json'
    },
    body: {
      bucketId: config.bucketId,
      prefix: fileName,
      maxFileCount: 1
    }
  });

  if (listResult.statusCode !== 200) {
    throw new Error(`获取文件信息失败: ${listResult.body.message}`);
  }

  const files = listResult.body.files || [];
  const targetFile = files.find(f => f.fileName === fileName);

  if (!targetFile) {
    log.warn(`[B2 GUI] 文件不存在或已删除: ${fileName}`);
    return { success: true, message: '文件不存在或已删除' };
  }

  // 3. 删除文件
  const deleteResult = await makeRequest({
    method: 'POST',
    url: `${auth.apiUrl}/b2api/v4/b2_delete_file_version`,
    headers: {
      'Authorization': auth.authToken,
      'Content-Type': 'application/json'
    },
    body: {
      fileId: targetFile.fileId,
      fileName: targetFile.fileName
    }
  });

  if (deleteResult.statusCode !== 200) {
    throw new Error(`删除失败: ${deleteResult.body.message}`);
  }

  log.info(`[B2 GUI] 删除成功: ${fileName}`);
  return { success: true, message: '删除成功' };
}

/**
 * 获取 B2 Bucket 中的文件列表
 */
async function listB2Files(config, maxFiles = 100) {
  const auth = await authorizeB2(config);
  
  const result = await makeRequest({
    method: 'POST',
    url: `${auth.apiUrl}/b2api/v4/b2_list_file_names`,
    headers: {
      'Authorization': auth.authToken,
      'Content-Type': 'application/json'
    },
    body: {
      bucketId: config.bucketId,
      maxFileCount: maxFiles
    }
  });

  if (result.statusCode !== 200) {
    throw new Error(`获取文件列表失败: ${result.body.message}`);
  }

  return result.body.files || [];
}

/**
 * GUI 菜单配置
 */
const guiMenu = (ctx) => {
  const config = ctx.getConfig('picBed.b2');
  
  if (!config) {
    return [
      {
        label: '⚠️ 请先配置 B2',
        async handle(ctx, guiApi) {
          await guiApi.showNotification({
            title: 'B2 插件',
            body: '请先在图床设置中配置 Backblaze B2'
          });
        }
      }
    ];
  }

  return [
    {
      label: '📁 查看 B2 Bucket 文件',
      async handle(ctx, guiApi) {
        try {
          await guiApi.showNotification({
            title: 'B2 插件',
            body: '正在获取文件列表...'
          });

          const files = await listB2Files(config, 50);
          
          if (files.length === 0) {
            await guiApi.showMessageBox({
              title: 'B2 Bucket 文件',
              message: 'Bucket 中没有文件',
              type: 'info',
              buttons: ['确定']
            });
            return;
          }

          // 构建文件列表文本
          const fileList = files.map((f, i) => 
            `${i + 1}. ${f.fileName} (${(f.contentLength / 1024).toFixed(2)} KB)`
          ).join('\n');

          const result = await guiApi.showMessageBox({
            title: `B2 Bucket 文件 (共 ${files.length} 个)`,
            message: fileList.substring(0, 1000) + (fileList.length > 1000 ? '\n...' : ''),
            type: 'info',
            buttons: ['确定', '复制列表']
          });

          if (result.result === 1) {
            // 用户点击"复制列表"
            ctx.emit('notification', {
              title: '已复制',
              body: '文件列表已复制到剪贴板',
              text: files.map(f => f.fileName).join('\n')
            });
          }
        } catch (err) {
          ctx.log.error('[B2 GUI] 获取文件列表失败:', err.message);
          await guiApi.showNotification({
            title: 'B2 错误',
            body: `获取文件列表失败: ${err.message}`
          });
        }
      }
    },
    {
      label: '🗑️ 删除云端文件',
      async handle(ctx, guiApi) {
        try {
          // 弹出输入框让用户输入文件名
          const fileName = await guiApi.showInputBox({
            title: '删除 B2 云端文件',
            placeholder: '请输入要删除的文件名 (例如: test/logo_1234567890_abc123.png)'
          });

          if (!fileName || fileName.trim() === '') {
            return;
          }

          // 确认删除
          const confirm = await guiApi.showMessageBox({
            title: '确认删除',
            message: `确定要删除云端文件 "${fileName}" 吗？\n此操作不可恢复！`,
            type: 'warning',
            buttons: ['取消', '删除']
          });

          if (confirm.result !== 1) {
            return;
          }

          await guiApi.showNotification({
            title: 'B2 插件',
            body: '正在删除...'
          });

          const result = await deleteB2File(fileName.trim(), config, ctx.log);

          await guiApi.showNotification({
            title: 'B2 删除结果',
            body: result.message
          });
        } catch (err) {
          ctx.log.error('[B2 GUI] 删除失败:', err.message);
          await guiApi.showNotification({
            title: 'B2 删除失败',
            body: err.message
          });
        }
      }
    },
    {
      label: '🔗 打开 B2 控制台',
      async handle(ctx, guiApi) {
        // 复制控制台 URL 到剪贴板
        const consoleUrl = 'https://secure.backblaze.com/b2.htm';
        ctx.emit('notification', {
          title: 'B2 控制台',
          body: '控制台链接已复制到剪贴板',
          text: consoleUrl
        });
      }
    }
  ];
};

/**
 * 监听相册删除事件
 * 当用户在相册删除图片时，同步删除 B2 云端文件
 */
const registerRemoveListener = (ctx) => {
  ctx.on('remove', async (files) => {
    const config = ctx.getConfig('picBed.b2');
    
    if (!config) {
      ctx.log.warn('[B2 GUI] 未配置 B2，跳过云端删除');
      return;
    }

    ctx.log.info(`[B2 GUI] 检测到 ${files.length} 个文件被删除，准备同步删除云端...`);

    for (const file of files) {
      // 只处理 B2 上传的文件
      if (file.type !== 'b2') {
        ctx.log.info(`[B2 GUI] 跳过非 B2 文件: ${file.fileName}`);
        continue;
      }

      try {
        // 从 URL 提取文件名
        const fileName = extractFileNameFromUrl(file.imgUrl, config.bucketName);
        
        if (!fileName) {
          ctx.log.warn(`[B2 GUI] 无法从 URL 提取文件名: ${file.imgUrl}`);
          continue;
        }

        ctx.log.info(`[B2 GUI] 删除云端文件: ${fileName}`);
        await deleteB2File(fileName, config, ctx.log);
        ctx.log.info(`[B2 GUI] 云端文件删除成功: ${fileName}`);
      } catch (err) {
        ctx.log.error(`[B2 GUI] 云端文件删除失败: ${err.message}`);
        // 不抛出错误，避免阻塞其他删除操作
      }
    }
  });

  ctx.log.info('[B2 GUI] 已注册相册删除监听器');
};

/**
 * 快捷键配置
 */
const commands = (ctx) => {
  return [
    {
      label: '快速删除 B2 云端文件',
      name: 'quickDelete',
      key: 'Ctrl+Shift+D',
      async handle(ctx, guiApi) {
        // 触发删除菜单
        const menu = guiMenu(ctx);
        if (menu[1]) {
          await menu[1].handle(ctx, guiApi);
        }
      }
    }
  ];
};

module.exports = {
  guiMenu,
  registerRemoveListener,
  commands
};
