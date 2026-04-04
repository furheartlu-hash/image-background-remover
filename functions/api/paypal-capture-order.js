// functions/api/paypal-capture-order.js
const PLANS = {
  basic:    { credits: 30,  plan: 'basic',    resetDays: 30 },
  pro:      { credits: 100, plan: 'pro',      resetDays: 30 },
  business: { credits: 300, plan: 'business', resetDays: 30 },
  credits20:{ credits: 20,  plan: null,       resetDays: null },
};

function paypalBase(env) {
  return env.PAYPAL_MODE === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
}

async function getPayPalToken(env) {
  const res = await fetch(`${paypalBase(env)}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + btoa(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const data = await res.json();
  return data.access_token;
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token'); 
  if (!token) return Response.redirect('/?payment=failed', 302);

  const ppToken = await getPayPalToken(env);

  const captureRes = await fetch(`${paypalBase(env)}/v2/checkout/orders/${token}/capture`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${ppToken}`, 'Content-Type': 'application/json' },
  });
  const capture = await captureRes.json();
  
  // 打印日志以便排查
  console.log('PayPal Capture Response:', JSON.stringify(capture));

  if (capture.status !== 'COMPLETED') return Response.redirect('/?payment=failed', 302);

  // 兼容性获取 custom_id
  const customId = capture.purchase_units?.[0]?.custom_id || 
                   capture.purchase_units?.[0]?.payments?.captures?.[0]?.custom_id || '';
  
  if (!customId || !customId.includes('|')) return Response.redirect('/?payment=failed', 302);

  const [userId, plan] = customId.split('|');
  const planInfo = PLANS[plan];

  if (!userId || !planInfo) return Response.redirect('/?payment=failed', 302);

  let resetAt = null;
  if (planInfo.resetDays) {
    const d = new Date();
    d.setDate(d.getDate() + planInfo.resetDays);
    resetAt = d.toISOString();
  }

  if (planInfo.plan) {
    await env.DB.prepare(`UPDATE users SET plan = ?, credits = ?, credits_reset_at = ?, updated_at = datetime('now') WHERE id = ?`).bind(planInfo.plan, planInfo.credits, resetAt, userId).run();
  } else {
    await env.DB.prepare(`UPDATE users SET credits = credits + ?, updated_at = datetime('now') WHERE id = ?`).bind(planInfo.credits, userId).run();
  }
  return Response.redirect('/?payment=success', 302);
}
