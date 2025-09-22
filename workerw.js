addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  const REAL_API_URL = 'https://rsps.westeurope.cloudapp.azure.com';

  // Log the incoming request with redacted sensitive information
  const url = new URL(request.url);
  const queryParams = new URLSearchParams(url.search);
  let signature = queryParams.get('Signature');
  if (signature) {
    queryParams.set('Signature', 'REDACTED');
  }
  const redactedUrl = `${url.origin}${url.pathname}?${queryParams.toString()}`;
  console.log(`Received request: ${request.method} ${redactedUrl}`);
  console.log(`Request headers:`, Object.fromEntries(request.headers.entries()));

  // Log the full Signature parameter
  if (signature) {
    console.log(`Full Signature: ${signature}`);
  }

  // Determine if the request method can have a body
  const hasBody = ['POST', 'PUT', 'PATCH'].includes(request.method);

  // Log the request body if it exists
  let requestBody = undefined;
  if (hasBody) {
    requestBody = await request.text();
    console.log(`Request body: ${requestBody}`);
    request = new Request(request, { body: requestBody }); // Reconstruct the request with the read body
  }

  // Create a new headers object without Cloudflare-specific headers
  const headers = new Headers(request.headers);
  headers.delete('CF-Connecting-IP');
  headers.delete('CF-RAY');
  headers.delete('CF-Visitor');
  headers.delete('True-Client-IP');
  headers.delete('X-Real-IP');

  // Forward the request to the real API with the original Signature and cleaned headers
  const response = await fetch(REAL_API_URL + request.url.replace(/https:\/\/[^/]+/, ''), {
    method: request.method,
    headers: headers,
    body: requestBody
  });

  // Log the response status and headers
  console.log(`Response status: ${response.status}`);
  console.log(`Response headers:`, Object.fromEntries(response.headers.entries()));

  // Log the response body if it exists
  const responseBody = await response.clone().text();
  console.log(`Response body: ${responseBody}`);

  return response;
}
