// functions/auth/callback.js - Google OAuth 回调
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  if (!code) return new Response('Missing code', { status: 400 });

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
  if (!tokenData.access_token) return new Response('OAuth failed', { status: 400 });

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

  return new Response(null, {
    status: 302,
    headers: {
      Location: '/',
      'Set-Cookie': `session=${sessionToken}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`,
    },
  });
}
