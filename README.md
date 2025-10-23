# Certificate Search MCP Server

基于 [crt.sh](https://crt.sh) 的 SSL/TLS 证书搜索与分析 MCP 服务器,部署在 Cloudflare Workers 上。

## 功能特性

本服务提供以下功能:

- 🔍 **证书搜索**: 根据域名搜索 SSL/TLS 证书记录
- 📊 **证书分析**: 分析证书分布、颁发机构、过期状态等
- 🔬 **详细信息**: 获取特定证书的完整详细信息
- 🌐 **子域名发现**: 通过证书记录发现子域名
- 🛡️ **安全研判**: 用于域名资产发现和安全审计

## 快速开始

### 一键部署

[![Deploy to Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/Randark-JMT/crt-mcp)

### 部署到 Cloudflare Workers

```bash
# 克隆或进入项目目录
cd crt-mcp

# 安装依赖
npm install

# 本地开发
npm run dev

# 部署到 Cloudflare
npm run deploy
```

部署后,您的 MCP 服务器将可通过以下 URL 访问:

- `https://crt-mcp.<your-account>.workers.dev/sse`
- `https://crt-mcp.<your-account>.workers.dev/mcp`

### 可用工具

#### 1. search_certificates

搜索指定域名的 SSL/TLS 证书

**参数:**

- `domain` (必需): 要搜索的域名,如 `example.com`
- `matchType` (可选): 匹配类型
  - `exact`: 精确匹配 (默认)
  - `wildcard`: 包含所有子域名
  - `subdomain`: 仅匹配子域名
- `limit` (可选): 最大返回结果数 (默认: 100)

**示例:**

```json
{
  "domain": "google.com",
  "matchType": "wildcard",
  "limit": 50
}
```

#### 2. get_certificate_details

获取特定证书的详细信息

**参数:**

- `certId` (必需): 证书 ID (从搜索结果中获取)

**示例:**

```json
{
  "certId": 123456789
}
```

#### 3. analyze_certificates

分析域名的证书使用情况

**参数:**

- `domain` (必需): 要分析的域名
- `matchType` (可选): 匹配类型 (默认: wildcard)

**示例:**

```json
{
  "domain": "example.com",
  "matchType": "wildcard"
}
```

#### 4. get_help

获取服务帮助信息

## 连接到 Cloudflare AI Playground

1. 访问 <https://playground.ai.cloudflare.com/>
2. 输入您部署的 MCP 服务器 URL (`crt-mcp.<your-account>.workers.dev/sse`)
3. 现在可以直接使用证书搜索工具了!

## 连接到 Claude Desktop

要将远程 MCP 服务器连接到 Claude Desktop,需要使用 [mcp-remote proxy](https://www.npmjs.com/package/mcp-remote)。

按照 [Anthropic's Quickstart](https://modelcontextprotocol.io/quickstart/user) 操作,在 Claude Desktop 中进入 Settings > Developer > Edit Config。

更新配置:

```json
{
  "mcpServers": {
    "certificate-search": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "http://localhost:8787/sse"
      ]
    }
  }
}
```

对于已部署的版本,使用:

```json
{
  "mcpServers": {
    "certificate-search": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://crt-mcp.<your-account>.workers.dev/sse"
      ]
    }
  }
}
```

重启 Claude Desktop,工具将可用。

## REST API 端点

除了 MCP 协议,本服务还提供 REST API:

### 搜索证书

```bash
# GET 请求
curl "https://crt-mcp.<your-account>.workers.dev/api/certificates/search?domain=example.com&matchType=wildcard&limit=10"

# POST 请求
curl -X POST https://crt-mcp.<your-account>.workers.dev/api/certificates/search \
  -H "Content-Type: application/json" \
  -d '{"domain":"example.com","matchType":"wildcard","limit":10}'
```

### 获取证书详情

```bash
curl "https://crt-mcp.<your-account>.workers.dev/api/certificates/details?certId=123456789"
```

## 使用场景

- 🔐 **域名资产发现**: 通过证书记录发现组织的所有域名和子域名
- 📅 **证书过期监控**: 检查证书过期状态,及时更新
- 🕵️ **子域名枚举**: 安全测试中的子域名收集
- 📋 **SSL/TLS 审计**: 审计证书颁发机构和配置
- 🎯 **安全研判**: 域名关联分析和威胁情报

## 开发

```bash
# 格式化代码
npm run format

# 修复 lint 问题
npm run lint:fix

# 类型检查
npm run type-check
```

## 数据源

本服务使用 [crt.sh](https://crt.sh) 作为数据源,这是一个由 Sectigo 提供的免费证书搜索服务。

## 许可

本项目基于 MIT 许可证开源。
