/**
 * 测试脚本 - 用于本地测试 index.js 插件
 * 
 * 使用方法:
 * 1. 复制 .env.json.example 为 .env.json
 * 2. 在 .env.json 中配置你的 B2 凭证
 * 3. 运行: node test.js /path/to/image.png
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { URL } = require('url');

/**
 * 模拟 PicGo 的 request 方法
 * 使用 Node.js 内置 https 模块
 */
function mockRequest(options) {
  return new Promise((resolve, reject) => {
    const url = new URL(options.url);
    const isHttps = url.protocol === 'https:';
    const client = isHttps ? https : require('http');
    
    const reqOptions = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    console.log(`[HTTP] ${reqOptions.method} ${url.hostname}${reqOptions.path}`);

    const req = client.request(reqOptions, (res) => {
      let data = Buffer.alloc(0);
      res.on('data', (chunk) => data = Buffer.concat([data, chunk]));
      res.on('end', () => {
        const response = { 
          statusCode: res.statusCode, 
          headers: res.headers 
        };
        
        if (options.json !== false) {
          try {
            response.body = JSON.parse(data.toString());
          } catch {
            response.body = data.toString();
          }
        } else {
          response.body = data;
        }
        
        resolve(response);
      });
    });

    req.on('error', reject);
    req.setTimeout(options.timeout || 60000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (options.body) {
      if (Buffer.isBuffer(options.body)) {
        req.write(options.body);
      } else if (typeof options.body === 'object') {
        req.write(JSON.stringify(options.body));
      } else {
        req.write(options.body);
      }
    }
    
    req.end();
  });
}

/**
 * 创建模拟的 PicGo ctx 对象
 */
function createMockCtx(config) {
  const notifications = [];
  const logs = [];

  return {
    // 配置获取
    getConfig: (key) => {
      if (key === 'picBed.b2') return config;
      return null;
    },

    // 日志
    log: {
      info: (msg) => {
        logs.push({ level: 'info', msg });
        console.log(`[INFO] ${msg}`);
      },
      error: (msg) => {
        logs.push({ level: 'error', msg });
        console.error(`[ERROR] ${msg}`);
      },
      warn: (msg) => {
        logs.push({ level: 'warn', msg });
        console.warn(`[WARN] ${msg}`);
      }
    },

    // 通知
    emit: (event, data) => {
      if (event === 'notification') {
        notifications.push(data);
        console.log(`[NOTIFICATION] ${data.title}: ${data.body}`);
      }
    },

    // HTTP 请求
    request: mockRequest,

    // 输出数组（上传后的结果）
    output: [],

    // 内部存储
    _notifications: notifications,
    _logs: logs
  };
}

/**
 * 主测试函数
 */
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

  // 读取文件
  const buffer = fs.readFileSync(imagePath);
  const fileName = path.basename(imagePath);
  const extname = path.extname(fileName);

  console.log('\n========================================');
  console.log('PicGo B2 Plugin Test');
  console.log('Testing: index.js');
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

  // 加载插件
  const plugin = require('./index.js');
  const ctx = createMockCtx(config);
  
  // 设置输出（模拟 PicGo 的输出格式）
  ctx.output = [{
    buffer,
    fileName,
    extname,
    width: 0,
    height: 0
  }];

  console.log('开始上传测试...\n');

  try {
    // 创建 helper 来捕获注册的 uploader
    const registeredUploaders = {};
    ctx.helper = {
      uploader: {
        register: (name, uploader) => {
          registeredUploaders[name] = uploader;
          console.log(`[Plugin] Registered uploader: ${name}`);
        }
      }
    };

    // 初始化并注册插件
    const pluginInstance = plugin(ctx);
    pluginInstance.register(ctx);

    // 获取 b2 uploader 并调用 handle
    const b2Uploader = registeredUploaders['b2'];
    if (!b2Uploader || !b2Uploader.handle) {
      throw new Error('B2 uploader not registered properly');
    }

    // 调用 index.js 中的实际 handle 方法
    await b2Uploader.handle(ctx);

    console.log('\n========================================');
    console.log('上传成功!');
    console.log('========================================');
    console.log(`文件 URL: ${ctx.output[0].imgUrl}`);
    console.log('');

  } catch (err) {
    console.log('\n========================================');
    console.log('上传失败!');
    console.log('========================================');
    console.error(`错误: ${err.message}`);
    console.error(err.stack);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('未捕获的错误:', err);
  process.exit(1);
});
