// functions/api/me.js - 获取当前用户信息
export async function onRequestGet({ request, env }) {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/session=([^;]+)/);
  const token = match ? match[1] : null;

  if (!token) return Response.json({ user: null });

  const user = await env.DB.prepare(
    'SELECT * FROM users WHERE session_token = ?'
  ).bind(token).first();

  if (!user) return Response.json({ user: null });

  return Response.json({
    user: {
      name: user.name,
      email: user.email,
      avatar: user.avatar_url,
      plan: user.plan || 'free',
      credits: user.credits ?? 5,
    },
  });
}
