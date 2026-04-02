// functions/auth/google.js - Google OAuth 登录入口
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: `${url.origin}/auth/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    state: crypto.randomUUID(),
  });
  return Response.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
    302
  );
}
