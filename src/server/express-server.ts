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
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Accept': 'application/json',
    'Accept-Language': 'fa,en;q=0.9',
    'Referer': 'https://divar.ir/',
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
        decodedPayload = JSON.parse(Buffer.from(payload, 'base64').toString());
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
    
    res.json(response);
  } catch (error: any) {
    console.error('Server proxy error:', error);
    res.status(500).json({ error: 'Proxy error', details: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Backend server running on http://localhost:${PORT}`);
}); 