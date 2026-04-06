export async function onRequestGet({ request, env }) {
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get('code');

    if (!code) {
      return new Response('Missing code', { status: 400 });
    }

    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
      return new Response('Google OAuth env vars missing', { status: 500 });
    }

    if (!env.DB || typeof env.DB.prepare !== 'function') {
      return new Response('D1 binding DB is missing', { status: 500 });
    }

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

    if (!tokenData.access_token) {
      return new Response(
        `OAuth failed: ${JSON.stringify(tokenData)}`,
        { status: 400 }
      );
    }

    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });

    const googleUser = await userRes.json();

    if (!googleUser.id || !googleUser.email) {
      return new Response(
        `Google user info invalid: ${JSON.stringify(googleUser)}`,
        { status: 500 }
      );
    }

    const sessionToken = crypto.randomUUID();

    await env.DB.prepare(`
      INSERT INTO users (google_id, email, name, avatar_url, session_token, plan, credits)
      VALUES (?, ?, ?, ?, ?, 'free', 5)
      ON CONFLICT(google_id) DO UPDATE SET
        email = excluded.email,
        name = excluded.name,
        avatar_url = excluded.avatar_url,
        session_token = excluded.session_token,
        updated_at = datetime('now')
    `)
      .bind(
        googleUser.id,
        googleUser.email,
        googleUser.name || '',
        googleUser.picture || '',
        sessionToken
      )
      .run();

    return new Response(null, {
      status: 302,
      headers: {
        Location: '/',
        'Set-Cookie': `session=${sessionToken}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`,
      },
    });
  } catch (err) {
    return new Response(`Callback crashed: ${err.message}`, { status: 500 });
  }
}
