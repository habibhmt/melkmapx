import { Hono } from "hono";
import { ofetch } from 'ofetch';
import { crawlArea, processPost } from './crawl';

const app = new Hono();

// In-memory storage for posts (since file system is not available in Cloudflare Workers)
const postsStorage = new Map<string, any[]>();

const httpClient = ofetch.create({
  baseURL: 'https://api.divar.ir',
  retryDelay: 30000,
  retry: 5,
  retryStatusCodes: [429],
  responseType: 'json',
  headers: {
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Accept': 'application/json',
    'Accept-Language': 'fa,en;q=0.9',
    'Referer': 'https://divar.ir/',
  },
})

// Load posts from memory
app.get('/api/load-posts/:polygonId', (c) => {
  const polygonId = c.req.param('polygonId');
  const posts = postsStorage.get(polygonId) || [];
  return c.json(posts);
});

// Crawl endpoint
app.post('/api/crawl', async (c) => {
  const body = await c.req.json();
  const { polygon } = body;
  
  if (!polygon || !polygon.geometry) {
    return c.json({ error: 'Invalid polygon data' }, 400);
  }

  console.log('🏃 Starting crawl for polygon:', polygon.properties?.name || 'Unknown');

  try {
    const results = await crawlArea(polygon);
    const posts = await Promise.all(results.map(processPost));
    const validPosts = posts.filter(p => p !== null);
    
    // Save to memory
    const polygonId = polygon.properties?.id || polygon.properties?.name || 'unknown';
    postsStorage.set(polygonId, validPosts);
    
    console.log(`✅ Saved ${validPosts.length} posts in memory for polygon ${polygonId}`);
    
    return c.json({ 
      success: true, 
      count: validPosts.length,
      polygonId,
      message: `Crawled ${validPosts.length} posts and saved in memory`
    });
  } catch (error: any) {
    console.error('Crawl error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// app.get("/api/", (c) => c.json({ name: "Cloudflare" }));


app.get('/divar/*', async (c) => {
  const url = c.req.path.replace(/^\/divar/g, '');
  const payload = c.req.query('payload');
  
  try {
    let decodedPayload = { method: 'GET', body: undefined };
    
    if (payload) {
      try {
        decodedPayload = JSON.parse(atob(payload));
      } catch (e) {
        console.error('Failed to decode payload:', e);
      }
    }
    
    const response = await httpClient(url, {
      method: decodedPayload.method || 'GET',
      body: decodedPayload.body,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'fa,en;q=0.9',
        'Referer': 'https://divar.ir/',
      },
    });
    
    return c.json(response);
  } catch (error) {
    console.error('Server proxy error:', error);
    return c.json({ error: 'Proxy error', details: error }, 500);
  }
})

export default app;