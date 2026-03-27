# Background Remover - Cloudflare 部署指南

## 项目结构
```
bg-remover-cloudflare/
├── index.html       # 前端页面
├── worker.js        # Cloudflare Worker 后端
├── wrangler.toml    # Cloudflare 配置
└── README.md        # 本文件
```

## 部署步骤

### 1. 推送到 GitHub
```bash
cd /root/.openclaw/workspace/projects/bg-remover-cloudflare
git init
git add .
git commit -m "Initial commit"
git remote add origin <你的GitHub仓库地址>
git push -u origin main
```

### 2. 部署 Cloudflare Worker（后端 API）
1. 安装 Wrangler CLI：`npm install -g wrangler`
2. 登录：`wrangler login`
3. 部署：`wrangler deploy`
4. 配置 API Key：
   ```bash
   wrangler secret put REMOVE_BG_API_KEY
   # 输入：JP4q9VgkM8XP2Nqz54e6Beky
   ```

### 3. 部署 Cloudflare Pages（前端）
1. 登录 Cloudflare Dashboard
2. 进入 Pages > Create a project
3. 连接 GitHub 仓库
4. 配置：
   - Build command: 留空
   - Build output directory: /
5. 部署

### 4. 配置 Worker 路由
在 Pages 设置中添加 Worker 路由：
- 路径：`/api/*`
- Worker：选择刚才部署的 Worker

## 完成！
访问你的 Cloudflare Pages 域名即可使用。
