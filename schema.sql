-- schema.sql - D1 数据库建表语句
-- 在 Cloudflare D1 控制台执行此文件

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  google_id TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  name TEXT,
  avatar_url TEXT,
  session_token TEXT,
  plan TEXT NOT NULL DEFAULT 'free',       -- free | basic | pro | business
  credits INTEGER NOT NULL DEFAULT 5,      -- 新用户一次性赠送 5 次
  credits_reset_at TEXT,                   -- 付费用户下次重置时间 (ISO8601)
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 如果已有旧表，执行以下语句补全字段（已有表时使用）：
-- ALTER TABLE users ADD COLUMN plan TEXT NOT NULL DEFAULT 'free';
-- ALTER TABLE users ADD COLUMN credits INTEGER NOT NULL DEFAULT 5;
-- ALTER TABLE users ADD COLUMN credits_reset_at TEXT;
