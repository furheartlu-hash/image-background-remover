// functions/auth/logout.js
export async function onRequestGet({ request, env }) {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/session=([^;]+)/);
  const token = match ? match[1] : null;
  
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
