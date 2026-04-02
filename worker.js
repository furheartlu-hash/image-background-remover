const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

// 生成随机 state 用于 OAuth
function randomState() {
  return crypto.randomUUID();
}

// 从 cookie 中获取 session token
function getSessionToken(request) {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/session=([^;]+)/);
  return match ? match[1] : null;
}

// 验证 session，返回用户信息
async function getUser(request, env) {
  const token = getSessionToken(request);
  if (!token) return null;
  const result = await env.DB.prepare(
    'SELECT * FROM users WHERE session_token = ?'
  ).bind(token).first();
  return result || null;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    // ── Google OAuth 登录入口 ──────────────────────────────────────
    if (url.pathname === '/auth/google') {
      const state = randomState();
      const params = new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID,
        redirect_uri: `${url.origin}/auth/callback`,
        response_type: 'code',
        scope: 'openid email profile',
        state,
      });
      return Response.redirect(
        `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
        302
      );
    }

    // ── Google OAuth 回调 ─────────────────────────────────────────
    if (url.pathname === '/auth/callback') {
      const code = url.searchParams.get('code');
      if (!code) return json({ error: 'Missing code' }, 400);

      // 换取 access token
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: env.GOOGLE_CLIENT_ID,
          client_secret: env.GOOGLE_CLIENT_SECRET,
          redirect_uri: `${url.origin}/auth/callback`,
          grant_type: 'authorization_code',
        }),
      });
      const tokenData = await tokenRes.json();
      if (!tokenData.access_token) return json({ error: 'OAuth failed' }, 400);

      // 获取用户信息
      const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const googleUser = await userRes.json();

      // 写入或更新数据库
      const sessionToken = crypto.randomUUID();
      await env.DB.prepare(`
        INSERT INTO users (google_id, email, name, avatar_url, session_token)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(google_id) DO UPDATE SET
          email = excluded.email,
          name = excluded.name,
          avatar_url = excluded.avatar_url,
          session_token = excluded.session_token,
          updated_at = CURRENT_TIMESTAMP
      `).bind(
        googleUser.id,
        googleUser.email,
        googleUser.name,
        googleUser.picture,
        sessionToken
      ).run();

      // 设置 cookie 并跳转回首页
      return new Response(null, {
        status: 302,
        headers: {
          Location: '/',
          'Set-Cookie': `session=${sessionToken}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`,
        },
      });
    }

    // ── 登出 ──────────────────────────────────────────────────────
    if (url.pathname === '/auth/logout') {
      const token = getSessionToken(request);
      if (token) {
        await env.DB.prepare('UPDATE users SET session_token = NULL WHERE session_token = ?')
          .bind(token).run();
      }
      return new Response(null, {
        status: 302,
        headers: {
          Location: '/',
          'Set-Cookie': 'session=; Path=/; Max-Age=0',
        },
      });
    }

    // ── 获取当前用户信息 ──────────────────────────────────────────
    if (url.pathname === '/api/me') {
      const user = await getUser(request, env);
      if (!user) return json({ user: null });
      return json({
        user: {
          name: user.name,
          email: user.email,
          avatar: user.avatar_url,
          plan: user.plan,
          credits: user.credits,
        },
      });
    }

    // ── 移除背景 ──────────────────────────────────────────────────
    if (url.pathname === '/api/remove-bg' && request.method === 'POST') {
      // 检查登录状态和额度
      const user = await getUser(request, env);
      if (!user) return json({ error: 'Please login first' }, 401);
      if (user.credits <= 0) return json({ error: 'No credits remaining' }, 402);

      const formData = await request.formData();
      const image = formData.get('image');
      if (!image) return json({ error: 'No image provided' }, 400);

      const apiFormData = new FormData();
      apiFormData.append('image_file', image);
      apiFormData.append('size', 'auto');

      const response = await fetch('https://api.remove.bg/v1.0/removebg', {
        method: 'POST',
        headers: { 'X-Api-Key': env.REMOVE_BG_API_KEY },
        body: apiFormData,
      });

      if (response.ok) {
        // 扣除一次额度
        await env.DB.prepare('UPDATE users SET credits = credits - 1 WHERE id = ?')
          .bind(user.id).run();

        return new Response(response.body, {
          headers: { 'Content-Type': 'image/png', ...CORS_HEADERS },
        });
      }

      return new Response(await response.text(), { status: response.status });
    }

    return json({ error: 'Not Found' }, 404);
  },
};
