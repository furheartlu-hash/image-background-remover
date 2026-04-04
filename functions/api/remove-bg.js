// functions/api/remove-bg.js - 移除背景
async function getUser(request, env) {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/session=([^;]+)/);
  const token = match ? match[1] : null;
  if (!token) return null;
  return await env.DB.prepare('SELECT * FROM users WHERE session_token = ?').bind(token).first();
}

// 按套餐决定输出尺寸：免费用 preview（低分辨率），付费用 regular/4k
function getSizeByPlan(plan) {
  switch (plan) {
    case 'business': return '4k';
    case 'pro':
    case 'basic':    return 'regular';
    case 'free':
    default:         return 'preview'; // 0.2 credits，节省成本
  }
}

export async function onRequestPost({ request, env }) {
  const user = await getUser(request, env);

  // 未登录
  if (!user) {
    return Response.json({ error: 'login_required', message: 'Please login first' }, { status: 401 });
  }

  // 额度耗尽
  if (user.credits <= 0) {
    return Response.json({
      error: 'no_credits',
      message: 'Your free credits are used up. Please upgrade to continue.',
    }, { status: 402 });
  }

  const formData = await request.formData();
  const image = formData.get('image');
  if (!image) return Response.json({ error: 'No image provided' }, { status: 400 });

  const size = getSizeByPlan(user.plan);

  const apiFormData = new FormData();
  apiFormData.append('image_file', image);
  apiFormData.append('size', size);

  const response = await fetch('https://api.remove.bg/v1.0/removebg', {
    method: 'POST',
    headers: { 'X-Api-Key': env.REMOVE_BG_API_KEY },
    body: apiFormData,
  });

  if (response.ok) {
    // 扣除一次额度
    await env.DB.prepare(
      'UPDATE users SET credits = credits - 1, updated_at = datetime(\'now\') WHERE id = ?'
    ).bind(user.id).run();

    return new Response(response.body, {
      headers: {
        'Content-Type': 'image/png',
        'Access-Control-Allow-Origin': '*',
        'X-Plan': user.plan,
        'X-Size': size,
      },
    });
  }

  return new Response(await response.text(), { status: response.status });
}
