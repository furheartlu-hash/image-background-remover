// functions/api/paypal-capture-order.js
// PayPal 支付完成后的回调，捕获支付并给用户充值 credits

const PLANS = {
  basic:    { credits: 30,  plan: 'basic',    resetDays: 30 },
  pro:      { credits: 100, plan: 'pro',      resetDays: 30 },
  business: { credits: 300, plan: 'business', resetDays: 30 },
  credits20:{ credits: 20,  plan: null,       resetDays: null }, // pay-as-you-go 不改套餐，只加次数
};

async function getPayPalToken(env) {
  const res = await fetch('https://api-m.paypal.com/v1/oauth2/token', {
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
  const token = url.searchParams.get('token'); // PayPal order ID
  if (!token) return Response.redirect('/?payment=failed', 302);

  const ppToken = await getPayPalToken(env);

  // 捕获支付
  const captureRes = await fetch(`https://api-m.paypal.com/v2/checkout/orders/${token}/capture`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ppToken}`,
      'Content-Type': 'application/json',
    },
  });
  const capture = await captureRes.json();

  if (capture.status !== 'COMPLETED') {
    return Response.redirect('/?payment=failed', 302);
  }

  // 从 custom_id 解析 userId 和 plan
  const customId = capture.purchase_units?.[0]?.payments?.captures?.[0]?.custom_id || '';
  const [userId, plan] = customId.split('|');
  const planInfo = PLANS[plan];

  if (!userId || !planInfo) return Response.redirect('/?payment=failed', 302);

  // 计算下次重置时间
  let resetAt = null;
  if (planInfo.resetDays) {
    const d = new Date();
    d.setDate(d.getDate() + planInfo.resetDays);
    resetAt = d.toISOString();
  }

  // 更新用户套餐和额度
  if (planInfo.plan) {
    // 订阅套餐：更新 plan + 设置 credits + 重置时间
    await env.DB.prepare(`
      UPDATE users
      SET plan = ?, credits = ?, credits_reset_at = ?, updated_at = datetime('now')
      WHERE id = ?
    `).bind(planInfo.plan, planInfo.credits, resetAt, userId).run();
  } else {
    // Pay-as-you-go：只追加 credits，不改套餐
    await env.DB.prepare(`
      UPDATE users
      SET credits = credits + ?, updated_at = datetime('now')
      WHERE id = ?
    `).bind(planInfo.credits, userId).run();
  }

  return Response.redirect('/?payment=success', 302);
}
