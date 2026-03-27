export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    
    if (url.pathname === '/api/remove-bg' && request.method === 'POST') {
      const formData = await request.formData();
      const image = formData.get('image');
      
      if (!image) {
        return new Response(JSON.stringify({error: 'No image provided'}), {
          status: 400,
          headers: {'Content-Type': 'application/json'}
        });
      }
      
      const apiFormData = new FormData();
      apiFormData.append('image_file', image);
      apiFormData.append('size', 'auto');
      
      const response = await fetch('https://api.remove.bg/v1.0/removebg', {
        method: 'POST',
        headers: {'X-Api-Key': env.REMOVE_BG_API_KEY},
        body: apiFormData
      });
      
      if (response.ok) {
        return new Response(response.body, {
          headers: {
            'Content-Type': 'image/png',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }
      
      return new Response(await response.text(), {status: response.status});
    }
    
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      });
    }
    
    return new Response('Not Found', {status: 404});
  }
};
