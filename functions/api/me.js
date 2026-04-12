export async function onRequestGet({ request, env }) {
  try {
    if (!env.DB || typeof env.DB.prepare !== 'function') {
      console.error('[api/me] D1 binding DB missing');
      return Response.json({ user: null }, { status: 500 });
    }

    const cookie = request.headers.get('Cookie') || '';
    const match = cookie.match(/session=([^;]+)/);
    const token = match ? match[1] : null;

    if (!token) {
      return Response.json({ user: null });
    }

    const user = await env.DB.prepare(
      'SELECT * FROM users WHERE session_token = ?'
    ).bind(token).first();

    if (!user) {
      return Response.json({ user: null });
    }

    return Response.json({
      user: {
        name: user.name,
        email: user.email,
        avatar: user.avatar_url,
        plan: user.plan || 'free',
        credits: user.credits ?? 5,
      },
    });
  } catch (err) {
    console.error('[api/me] Unhandled error:', err);
    return Response.json({ user: null }, { status: 500 });
  }
}
