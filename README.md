# picgo-plugin-backblaze

[PicGo](https://github.com/Molunerfinn/PicGo) 的 [Backblaze B2](https://www.backblaze.com/b2/cloud-storage.html) 云存储上传插件。

This is a PicGo uploader plugin for Backblaze B2 Cloud Storage.

![Logo](logo.png)

## 功能特性

- ✅ 支持 Backblaze B2 云存储上传
- ✅ 支持自定义域名
- ✅ 支持上传路径前缀设置
- ✅ 自动生成唯一文件名避免冲突
- ✅ 支持 PicGo CLI 和 GUI 版本
- ✅ 支持常见图片格式（jpg, png, gif, webp, svg 等）

## 安装

### 通过 PicGo GUI 安装

1. 打开 PicGo，进入「插件设置」
2. 搜索 `picgo-plugin-backblaze`
3. 点击安装

### 通过 NPM 安装 (CLI 版本)

```bash
npm install picgo-plugin-backblaze -g
```

或

```bash
picgo install picgo-plugin-backblaze
```

## 配置

### 获取 B2 配置信息

1. 登录 [Backblaze B2](https://secure.backblaze.com/b2.htm) 控制台
2. 创建或选择一个 Bucket，记录 **Bucket ID** 和 **Bucket Name**
   - Bucket ID 格式类似：`706d27df06cf42be92cd0a1a`
   - Bucket Name 是你设定的名称，如：`my-bucket`
3. 进入「Application Keys」页面
4. 创建一个新的 Application Key，记录 **Key ID** 和 **Key**
   - **注意**：Application Key ID 和 Account ID 是不同的

### 配置项说明

| 配置项 | 说明 | 是否必填 |
|--------|------|----------|
| Application Key ID | B2 Application Key ID（不是 Account ID） | 是 |
| Application Key | B2 Application Key（密钥） | 是 |
| Bucket ID | B2 Bucket ID | 是 |
| Bucket Name | B2 Bucket Name | 是 |
| Custom Domain | 自定义域名（可选） | 否 |
| Path Prefix | 上传路径前缀（可选，例如：`images/2024`） | 否 |

### 配置方法

#### GUI 版本

1. 进入「图床设置」
2. 选择「Backblaze B2」
3. 填写配置信息
4. 点击「确认」保存

#### CLI 版本

```bash
picgo set uploader b2
```

按照提示输入配置信息即可。

## 使用

配置完成后，将 PicGo 的默认图床设置为「Backblaze B2」，然后正常使用 PicGo 上传图片即可。

```bash
# CLI 示例
picgo upload image.png
```

## 自定义域名

如果你有绑定自定义域名到 B2 Bucket，可以在「Custom Domain」配置项中填写，例如：

```
https://cdn.example.com
```

上传后的图片 URL 将使用你的自定义域名。

## 路径前缀

如果你希望将图片上传到特定的文件夹中，可以在「Path Prefix」配置项中填写路径前缀，例如：

```
images/2024/blog
```

上传后的文件将保存在 `images/2024/blog/` 目录下。

## 注意事项

1. **确保你的 B2 Bucket 是公开的**，或者你使用的 Application Key 有读取文件的权限
2. **如果 Bucket 是私有的**，你需要额外配置访问权限或使用自定义域名 + CDN
3. **上传的文件名会自动添加时间戳和随机字符串**，避免文件名冲突，格式为：`filename_timestamp_random.ext`
4. **关于 Application Key ID**：请使用创建 Application Key 时生成的 Key ID，不是 Account ID

## 开发

### 本地开发

```bash
# 克隆仓库
git clone https://github.com/yourusername/picgo-plugin-backblaze.git
cd picgo-plugin-b2

# 本地安装到 PicGo
npm install /path/to/picgo-plugin-backblaze --prefix ~/.picgo

# 或使用 symlink
cd ~/.picgo
npm link /path/to/picgo-plugin-backblaze
```

### 本地测试

```bash
# 复制配置模板
cp .env.json.example .env.json

# 编辑 .env.json 填入你的 B2 凭证

# 运行测试
node test.js image.png
```

### 项目结构

```
picgo-plugin-b2/
├── index.js          # 主插件代码
├── package.json      # NPM 包配置
├── logo.png          # 插件图标
├── test.js           # 本地测试脚本
├── README.md         # 用户文档
├── AGENTS.md         # 开发文档
└── .env.json.example # 配置模板
```

## 故障排除

### 授权失败

- 检查 Application Key ID 是否正确（不是 Account ID）
- 检查 Application Key 是否过期
- 检查 Key 是否有访问目标 Bucket 的权限

### 上传失败

- 检查 Bucket ID 和 Bucket Name 是否匹配
- 检查网络连接
- 查看 PicGo 日志获取详细错误信息

## 兼容性

- **PicGo 版本**: 2.0.0+
- **PicGo-Core 版本**: 1.5.0+
- **Node.js 版本**: 14.0.0+

## License

MIT
