// functions/api/paypal-create-order.js
// 创建 PayPal 订单，前端调用后跳转到 PayPal 付款页

const PLANS = {
  basic:    { price: '7.00',  credits: 30,  label: 'Basic Plan - 30 credits/month' },
  pro:      { price: '25.00', credits: 100, label: 'Pro Plan - 100 credits/month' },
  business: { price: '65.00', credits: 300, label: 'Business Plan - 300 credits/month' },
  credits20:{ price: '5.00',  credits: 20,  label: 'Pay-as-you-go - 20 credits' },
};

// Set PAYPAL_MODE=live in Cloudflare secrets when going to production
function paypalBase(env) {
  return env.PAYPAL_MODE === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';
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

async function getUser(request, env) {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/session=([^;]+)/);
  const token = match ? match[1] : null;
  if (!token) return null;
  return await env.DB.prepare('SELECT * FROM users WHERE session_token = ?').bind(token).first();
}

export async function onRequestPost({ request, env }) {
  const user = await getUser(request, env);
  if (!user) return Response.json({ error: 'login_required' }, { status: 401 });

  const { plan } = await request.json();
  const planInfo = PLANS[plan];
  if (!planInfo) return Response.json({ error: 'Invalid plan' }, { status: 400 });

  const token = await getPayPalToken(env);
  const origin = new URL(request.url).origin;

  const orderRes = await fetch(`${paypalBase(env)}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [{
        description: planInfo.label,
        custom_id: `${user.id}|${plan}`,  // 回调时用于识别用户和套餐
        amount: {
          currency_code: 'USD',
          value: planInfo.price,
        },
      }],
      application_context: {
        return_url: `${origin}/api/paypal-capture-order`,
        cancel_url: `${origin}/?payment=cancelled`,
        brand_name: 'Background Remover',
        user_action: 'PAY_NOW',
      },
    }),
  });

  const order = await orderRes.json();
  if (!order.id) return Response.json({ error: 'Failed to create order', detail: order }, { status: 500 });

  // 返回 PayPal 跳转链接
  const approveLink = order.links.find(l => l.rel === 'approve');
  return Response.json({ orderId: order.id, approveUrl: approveLink?.href });
}
