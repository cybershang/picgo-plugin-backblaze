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

## 参考资料

- PicGo 插件开发文档: https://docs.picgo.app/zh/core/dev-guide/cli
- PicGo GUI 插件文档: https://docs.picgo.app/zh/core/dev-guide/gui
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
