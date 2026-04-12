const PLANS = {
  basic: { credits: 30, plan: 'basic', resetDays: 30 },
  pro: { credits: 100, plan: 'pro', resetDays: 30 },
  business: { credits: 300, plan: 'business', resetDays: 30 },
  credits20: { credits: 20, plan: null, resetDays: null },
};

function paypalBase(env) {
  return env.PAYPAL_MODE === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';
}

async function getPayPalToken(env) {
  const res = await fetch(`${paypalBase(env)}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + btoa(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  const data = await res.json();

  if (!data.access_token) {
    console.error('[paypal-capture-order] Failed to get PayPal token', data);
    throw new Error('Failed to get PayPal token');
  }

  return data.access_token;
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const origin = url.origin;

  const redirectTo = (path) => Response.redirect(`${origin}${path}`, 302);

  try {
    const token = url.searchParams.get('token');
    if (!token) {
      console.error('[paypal-capture-order] Missing token');
      return redirectTo('/?payment=failed');
    }

    const ppToken = await getPayPalToken(env);

    const captureRes = await fetch(`${paypalBase(env)}/v2/checkout/orders/${token}/capture`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ppToken}`,
        'Content-Type': 'application/json',
      },
    });

    const capture = await captureRes.json();
    console.log('[paypal-capture-order] Capture response:', JSON.stringify(capture));

    if (capture.status !== 'COMPLETED') {
      console.error('[paypal-capture-order] Capture not completed', capture);
      return redirectTo('/?payment=failed');
    }

    const customId =
      capture.purchase_units?.[0]?.custom_id ||
      capture.purchase_units?.[0]?.payments?.captures?.[0]?.custom_id ||
      '';

    if (!customId || !customId.includes('|')) {
      console.error('[paypal-capture-order] Invalid custom_id', { customId, capture });
      return redirectTo('/?payment=failed');
    }

    const [userId, plan] = customId.split('|');
    const planInfo = PLANS[plan];

    if (!userId || !planInfo) {
      console.error('[paypal-capture-order] Invalid userId or plan', { userId, plan });
      return redirectTo('/?payment=failed');
    }

    let resetAt = null;
    if (planInfo.resetDays) {
      const d = new Date();
      d.setDate(d.getDate() + planInfo.resetDays);
      resetAt = d.toISOString();
    }

    if (!env.DB || typeof env.DB.prepare !== 'function') {
      console.error('[paypal-capture-order] D1 binding DB is missing');
      return redirectTo('/?payment=failed');
    }

    if (planInfo.plan) {
      await env.DB.prepare(`
        UPDATE users
        SET plan = ?, credits = ?, credits_reset_at = ?, updated_at = datetime('now')
        WHERE id = ?
      `).bind(planInfo.plan, planInfo.credits, resetAt, userId).run();
    } else {
      await env.DB.prepare(`
        UPDATE users
        SET credits = credits + ?, updated_at = datetime('now')
        WHERE id = ?
      `).bind(planInfo.credits, userId).run();
    }

    return redirectTo('/?payment=success');
  } catch (err) {
    console.error('[paypal-capture-order] Unhandled error:', err);
    return redirectTo('/?payment=failed');
  }
}
