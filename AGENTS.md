# AGENTS.md - picgo-plugin-b2

## 项目概述

这是一个为 [PicGo](https://github.com/Molunerfinn/PicGo) 开发的插件，用于将图片上传到 [Backblaze B2](https://www.backblaze.com/b2/cloud-storage.html) 云存储服务。

## 技术栈

- **语言**: JavaScript (Node.js)
- **模块系统**: CommonJS
- **依赖**: 仅使用 Node.js 内置模块 (crypto)
- **外部 API**: Backblaze B2 Native API v4

## 项目结构

```
.
├── index.js          # 主入口文件，包含所有上传逻辑
├── package.json      # NPM 包配置
├── README.md         # 用户文档
└── AGENTS.md         # 本文件
```

## 核心功能模块

### 1. 授权认证 (`authorizeAccount`)
- 调用 `b2_authorize_account` API
- 使用 Basic Auth (base64 编码的 Key ID + Key)
- 返回 API URL、Auth Token 和下载 URL

### 2. 获取上传 URL (`getUploadUrl`)
- 调用 `b2_get_upload_url` API
- 需要 Bucket ID
- 返回临时的上传 URL 和 Token

### 3. 文件上传 (`uploadFile`)
- 调用 `b2_upload_file` API
- 需要计算文件的 SHA1 校验
- 支持设置 Content-Type

### 4. 文件 URL 构建 (`buildFileUrl`)
- 支持自定义域名
- 回退到 B2 原生 URL 格式

## 配置项

| 配置名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| applicationKeyId | string | 是 | B2 Application Key ID |
| applicationKey | string | 是 | B2 Application Key (密钥) |
| bucketId | string | 是 | B2 Bucket ID |
| bucketName | string | 是 | B2 Bucket 名称 |
| customDomain | string | 否 | 自定义域名，用于构建文件 URL |
| pathPrefix | string | 否 | 上传路径前缀，如 `images/2024` |

## 开发规范

### 代码风格
- 使用单引号
- 缩进: 2 个空格
- 分号: 使用
- 注释: JSDoc 格式

### 错误处理
- 所有 API 调用都需要检查 statusCode
- 错误信息通过 `ctx.emit('notification', ...)` 通知用户
- 日志通过 `ctx.log.info/error` 记录

### 命名规范
- 函数: camelCase
- 常量: UPPER_SNAKE_CASE (如有)
- 变量: camelCase

## 测试方法

### 官方推荐测试方式 (PicGo CLI)

1. **全局安装 PicGo**:
   ```bash
   npm install picgo -g
   picgo -h  # 首次运行需要初始化
   ```

2. **本地安装插件**:
   将插件文件夹放入 PicGo 配置目录，然后:
   ```bash
   # 进入 PicGo 配置目录
   cd ~/.config/picgo  # Linux/macOS
   # 或 %APPDATA%/picgo  # Windows
   
   # 本地安装插件
   npm install /path/to/picgo-plugin-b2
   ```

3. **测试上传**:
   ```bash
   picgo set uploader b2    # 配置 B2
   picgo upload image.png   # 测试上传
   ```

### GUI 版本测试

- **PicGo 2.3.0+**: 插件设置 → 导入本地插件 → 选择插件目录
- 修改代码后需要**完全退出** PicGo 进程再重启才能生效

### 本地测试脚本

项目提供了 `test.js` 用于快速测试（无需安装 PicGo）:
```bash
cp .env.json.example .env.json
# 编辑 .env.json 填入 B2 凭证
node test.js image.png
```
注意: `test.js` 会模拟 PicGo 的 ctx 对象并调用 `index.js` 中的实际代码。

## 发布要求

### NPM 包配置

- **命名规范**: 必须使用 `picgo-plugin-<name>` 格式
- **package.json** 关键字段:
  ```json
  {
    "name": "picgo-plugin-b2",
    "description": "PicGo uploader plugin for Backblaze B2",
    "homepage": "https://github.com/xxx/picgo-plugin-b2#readme",
    "keywords": ["picgo", "picgo-plugin", "picgo-gui-plugin"],
    "main": "index.js"
  }
  ```

### GUI 优化（可选）

- 添加 `logo.png` 到包根目录作为插件图标
- 在 `keywords` 中添加 `"picgo-gui-plugin"` 表示支持 GUI
- 插件入口必须明确指定 uploader/transformer name:
  ```js
  module.exports = (ctx) => {
    return {
      register,
      uploader: 'b2'  // 必须指定
    }
  }
  ```

## 参考资料

- PicGo 插件开发文档: https://docs.picgo.app/zh/core/dev-guide/cli
- PicGo GUI 插件文档: https://docs.picgo.app/zh/core/dev-guide/gui
- PicGo 测试与发布: https://docs.picgo.app/zh/core/dev-guide/deploy
- B2 API 文档: https://www.backblaze.com/apidocs/introduction-to-the-b2-native-api
- B2 上传文件 API: https://www.backblaze.com/apidocs/b2-upload-file

## 注意事项

1. **文件名唯一性**: 上传时会自动生成带时间戳和随机字符串的文件名，避免冲突
2. **Content-Type**: 自动根据文件扩展名识别常见图片类型
3. **路径编码**: 文件名使用 `encodeURIComponent` 编码
4. **SHA1 计算**: B2 要求上传时必须提供文件的 SHA1 校验值

## 扩展建议

可能的未来功能:
- GUI 菜单支持（删除云端文件）
- 批量删除功能
- 上传进度显示
- 文件列表浏览
- 自定义命名规则
