// functions/api/remove-bg.js - 移除背景
async function getUser(request, env) {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/session=([^;]+)/);
  const token = match ? match[1] : null;
  if (!token) return null;
  return await env.DB.prepare('SELECT * FROM users WHERE session_token = ?').bind(token).first();
}

export async function onRequestPost({ request, env }) {
  const user = await getUser(request, env);
  if (!user) return Response.json({ error: 'Please login first' }, { status: 401 });
  if (user.credits <= 0) return Response.json({ error: 'No credits remaining' }, { status: 402 });

  const formData = await request.formData();
  const image = formData.get('image');
  if (!image) return Response.json({ error: 'No image provided' }, { status: 400 });

  const apiFormData = new FormData();
  apiFormData.append('image_file', image);
  apiFormData.append('size', 'auto');

  const response = await fetch('https://api.remove.bg/v1.0/removebg', {
    method: 'POST',
    headers: { 'X-Api-Key': env.REMOVE_BG_API_KEY },
    body: apiFormData,
  });

  if (response.ok) {
    await env.DB.prepare('UPDATE users SET credits = credits - 1 WHERE id = ?').bind(user.id).run();
    return new Response(response.body, {
      headers: { 'Content-Type': 'image/png', 'Access-Control-Allow-Origin': '*' },
    });
  }

  return new Response(await response.text(), { status: response.status });
}
