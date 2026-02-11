# picgo-plugin-b2

[PicGo](https://github.com/Molunerfinn/PicGo) 的 [Backblaze B2](https://www.backblaze.com/b2/cloud-storage.html) 云存储上传插件。

This is a PicGo uploader plugin for Backblaze B2 Cloud Storage.

## 功能特性

- ✅ 支持 Backblaze B2 云存储上传
- ✅ 支持自定义域名
- ✅ 支持上传路径前缀设置
- ✅ 自动生成唯一文件名避免冲突
- ✅ 支持 PicGo CLI 和 GUI 版本

## 安装

### 通过 PicGo GUI 安装

1. 打开 PicGo，进入「插件设置」
2. 搜索 `picgo-plugin-b2`
3. 点击安装

### 通过 NPM 安装 (CLI 版本)

```bash
npm install picgo-plugin-b2 -g
```

或

```bash
picgo install picgo-plugin-b2
```

## 配置

### 获取 B2 配置信息

1. 登录 [Backblaze B2](https://secure.backblaze.com/b2.htm) 控制台
2. 创建或选择一个 Bucket，记录 **Bucket ID** 和 **Bucket Name**
3. 进入「Application Keys」页面
4. 创建一个新的 Application Key，记录 **Key ID** 和 **Key**

### 配置项说明

| 配置项 | 说明 | 是否必填 |
|--------|------|----------|
| Application Key ID | B2 Application Key ID（或 Account ID） | 是 |
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

1. 确保你的 B2 Bucket 是公开的，或者你使用的 Application Key 有读取文件的权限
2. 如果 Bucket 是私有的，你需要额外配置访问权限或使用自定义域名 + CDN
3. 上传的文件名会自动添加时间戳和随机字符串，避免文件名冲突

## License

MIT
