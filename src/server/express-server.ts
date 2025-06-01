import express from 'express';
import cors from 'cors';
import { ofetch } from 'ofetch';

const app = express();
const PORT = 8787;

app.use(cors());
app.use(express.json());

const httpClient = ofetch.create({
  baseURL: 'https://api.divar.ir',
  retryDelay: 30000,
  retry: 5,
  retryStatusCodes: [429],
  responseType: 'json',
  headers: {
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'fa,en;q=0.9,en-US;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Referer': 'https://divar.ir/',
    'Origin': 'https://divar.ir',
    'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"macOS"',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-site',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
  },
});

// Proxy for Divar API
app.use('/divar', async (req, res) => {
  const url = req.path;
  const payload = req.query.payload as string;
  
  try {
    let decodedPayload = { method: 'GET', body: undefined };
    
    if (payload) {
      try {
        const decoded = Buffer.from(payload, 'base64').toString('utf-8');
        decodedPayload = JSON.parse(decoded);
      } catch (e) {
        console.error('Failed to decode payload:', e);
      }
    }

    console.log(`🔍 Proxying ${decodedPayload.method} request to: ${url}`);
    
    const response = await httpClient(url, {
      method: decodedPayload.method || 'GET',
      body: decodedPayload.body ? JSON.stringify(decodedPayload.body) : undefined,
      headers: {
        'X-Forwarded-For': req.ip || '127.0.0.1',
        'X-Real-IP': req.ip || '127.0.0.1',
        'X-Request-ID': Math.random().toString(36).substring(7),
      } as Record<string, string>
    });

    res.json(response);
  } catch (error: any) {
    console.error('Server proxy error:', error);
    res.status(500).json({ 
      error: 'Proxy error', 
      details: error.message,
      url: url
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Backend server running on http://localhost:${PORT}`);
}); 