export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const origin = url.origin;

  const redirectTo = (path) => Response.redirect(`${origin}${path}`, 302);

  try {
    const code = url.searchParams.get('code');

    if (!code) {
      console.error('[auth/callback] Missing code');
      return redirectTo('/?login=failed');
    }

    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
      console.error('[auth/callback] Google OAuth env vars missing');
      return redirectTo('/?login=failed');
    }

    if (!env.DB || typeof env.DB.prepare !== 'function') {
      console.error('[auth/callback] D1 binding DB is missing');
      return redirectTo('/?login=failed');
    }

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: `${origin}/auth/callback`,
        grant_type: 'authorization_code',
      }),
    });

    const tokenData = await tokenRes.json();

    if (!tokenData.access_token) {
      console.error('[auth/callback] OAuth token exchange failed', tokenData);
      return redirectTo('/?login=failed');
    }

    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });

    const googleUser = await userRes.json();

    if (!googleUser.id || !googleUser.email) {
      console.error('[auth/callback] Invalid Google user info', googleUser);
      return redirectTo('/?login=failed');
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
    console.error('[auth/callback] Unhandled error:', err);
    return redirectTo('/?login=failed');
  }
}
