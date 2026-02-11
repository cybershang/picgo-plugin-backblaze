/**
 * 测试脚本 - 用于本地测试 B2 上传逻辑
 * 
 * 使用方法:
 * 1. 在 .env 文件中配置你的 B2 凭证
 * 2. 运行: node test.js /path/to/image.png
 */

const fs = require('fs');
const path = require('path');

// 模拟 PicGo 的 ctx 对象
const createMockCtx = (config) => {
  const logs = [];
  const notifications = [];

  return {
    getConfig: (key) => {
      if (key === 'picBed.b2') return config;
      return null;
    },
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
    emit: (event, data) => {
      if (event === 'notification') {
        notifications.push(data);
        console.log(`[NOTIFICATION] ${data.title}: ${data.body}`);
      }
    },
    request: require('urllib').request || require('request'),
    output: [],
    _logs: logs,
    _notifications: notifications
  };
};

// 读取配置文件
const loadConfig = () => {
  const configPath = path.join(__dirname, '.env.json');
  if (!fs.existsSync(configPath)) {
    console.error('错误: 找不到 .env.json 配置文件');
    console.log('\n请创建 .env.json 文件，格式如下:');
    console.log(JSON.stringify({
      applicationKeyId: 'your-key-id',
      applicationKey: 'your-application-key',
      bucketId: 'your-bucket-id',
      bucketName: 'your-bucket-name',
      customDomain: '',
      pathPrefix: 'test'
    }, null, 2));
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
};

// 主测试函数
const runTest = async () => {
  const imagePath = process.argv[2];
  
  if (!imagePath) {
    console.error('用法: node test.js <图片路径>');
    process.exit(1);
  }

  if (!fs.existsSync(imagePath)) {
    console.error(`错误: 找不到文件 ${imagePath}`);
    process.exit(1);
  }

  const config = loadConfig();
  const buffer = fs.readFileSync(imagePath);
  const fileName = path.basename(imagePath);
  const extname = path.extname(fileName);

  console.log('========================================');
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

  // 加载插件
  const plugin = require('./index.js');
  const ctx = createMockCtx(config);
  
  // 设置输出
  ctx.output = [{
    buffer,
    fileName,
    extname,
    width: 0,
    height: 0
  }];

  console.log('开始上传测试...\n');

  try {
    const result = await plugin(ctx).register(ctx);
    console.log('\n========================================');
    console.log('上传成功!');
    console.log('========================================');
    console.log(`URL: ${ctx.output[0].imgUrl}`);
  } catch (err) {
    console.log('\n========================================');
    console.log('上传失败!');
    console.log('========================================');
    console.error(`错误: ${err.message}`);
    process.exit(1);
  }
};

runTest();
