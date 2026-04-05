import express from 'express';
import path from 'path';
import multer from 'multer';
import pdfParse from 'pdf-parse-new';
import * as cheerio from 'cheerio';
import { GoogleGenAI, Type } from '@google/genai';

const app = express();
const PORT = 3000;

app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });

// API Routes

// 1. Parse Resume
app.post('/api/upload-resume', (req, res, next) => {
  upload.single('resume')(req, res, (err) => {
    if (err) {
      console.error('Multer error:', err);
      return res.status(400).json({ error: `Upload error: ${err.message}` });
    }
    next();
  });
}, async (req, res) => {
  console.log('Received upload-resume request');
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    // Create a copy of the buffer to prevent ArrayBuffer detachment issues when pdf.js transfers it to a worker
    const data = await pdfParse(req.file.buffer);
    res.json({ text: data.text });
  } catch (error: any) {
    console.error('Error parsing PDF:', error);
    res.status(500).json({ error: error.message || 'Failed to parse PDF' });
  }
});

// 2. Scrape Job URLs
app.get('/api/jobs', async (req, res) => {
  try {
    const url = 'https://www.rwth-aachen.de/cms/root/wir/Karriere/~buym/RWTH-Jobportal/?showall=1';
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch jobs: ${response.status} ${response.statusText}`);
    }
    const html = await response.text();
    const $ = cheerio.load(html);
    
    const jobUrls: string[] = [];
    $('a').each((_, el) => {
      const href = $(el).attr('href');
      if (href && href.includes('/go/id/kbag/file/')) {
         const fullUrl = href.startsWith('http') ? href : `https://www.rwth-aachen.de${href}`;
         if (!jobUrls.includes(fullUrl)) {
           jobUrls.push(fullUrl);
         }
      }
    });
    
    res.json({ urls: jobUrls });
  } catch (error) {
    console.error('Error scraping jobs:', error);
    res.status(500).json({ error: 'Failed to scrape jobs' });
  }
});

// 3. Scrape Job Details
app.post('/api/jobs/details', async (req, res) => {
  try {
    const { urls } = req.body;
    if (!urls || !Array.isArray(urls)) {
      return res.status(400).json({ error: 'Invalid URLs array' });
    }

    const results = await Promise.all(urls.map(async (url) => {
      try {
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          }
        });
        if (!response.ok) {
          throw new Error(`Failed to fetch job details: ${response.status} ${response.statusText}`);
        }
        const html = await response.text();
        const $ = cheerio.load(html);
        
        // Extract sections based on common RWTH job posting structure
        // This might need adjustment based on actual HTML
        const title = $('h1').first().text().trim() || 'N/A';
        
        const extractSection = (headingText: string) => {
           let content = 'N/A';
           $('h2, h3, h4').each((_, el) => {
             if ($(el).text().trim().toLowerCase().includes(headingText.toLowerCase())) {
               content = $(el).nextUntil('h2, h3, h4').text().trim();
             }
           });
           return content;
        };

        const srNumberMatch = url.match(/\/file\/([A-Z0-9]+)/);
        const srNumber = srNumberMatch ? srNumberMatch[1] : `UNKNOWN-${Math.random().toString(36).substring(2, 8)}`;

        return {
          url,
          srNumber,
          title,
          anbieter: extractSection('Anbieter') || extractSection('Institution'),
          unserProfil: extractSection('Unser Profil'),
          ihrProfil: extractSection('Ihr Profil'),
          ihreAufgaben: extractSection('Ihre Aufgaben'),
          unserAngebot: extractSection('Unser Angebot'),
          uberUns: extractSection('Über uns'),
          bewerbung: extractSection('Bewerbung'),
          email: extractSection('E-Mail'),
        };
      } catch (err) {
        console.error(`Error scraping ${url}:`, err);
        return {
          url,
          srNumber: 'N/A',
          title: 'Error',
          anbieter: 'N/A',
          unserProfil: 'N/A',
          ihrProfil: 'N/A',
          ihreAufgaben: 'N/A',
          unserAngebot: 'N/A',
          uberUns: 'N/A',
          bewerbung: 'N/A',
          email: 'N/A',
        };
      }
    }));

    res.json({ jobs: results });
  } catch (error) {
    console.error('Error scraping job details:', error);
    res.status(500).json({ error: 'Failed to scrape job details' });
  }
});

// 4. Match Jobs with Gemini
app.post('/api/match-jobs', async (req, res) => {
  let apiKey = '';
  try {
    const { resumeText, jobs, apiKey: reqApiKey } = req.body;
    if (!resumeText || !jobs || !Array.isArray(jobs)) {
      return res.status(400).json({ error: 'Invalid input' });
    }

    apiKey = reqApiKey || process.env.GEMINI_API_KEY || '';
    if (!apiKey || apiKey === 'undefined') {
      apiKey = process.env.API_KEY || '';
    }
    console.log('API Key length:', apiKey ? apiKey.length : 'undefined');
    if (!apiKey || apiKey === 'undefined') {
      console.error('No valid API key found in environment variables or request body');
      return res.status(500).json({ error: 'API key configuration error' });
    }
    const ai = new GoogleGenAI({ apiKey });
    
    // Format jobs for prompt
    const jobsContext = jobs.map((job: any) => `SR Number: ${job.srNumber}\nUnser Profil: ${job.unserProfil}\nIhr Profil: ${job.ihrProfil}\nIhre Aufgaben: ${job.ihreAufgaben}`).join('\n\n');
    
    const prompt = `Here is a candidate's resume:
${resumeText}

Here are ${jobs.length} job requirements labeled by their SR Number:
${jobsContext}

Analyze the resume against each job requirement. It is necessary that you check all details accuratly, do not reecomend jobs that the user is unqualified for or do not reccomend jobs that do not match well with the reusme text. Example: Many of the jobs are for research associates and they require a completed university masters degree if the user themselves are still presently doing a masters degree do not return such jobs back even if other aspects match. Be strict with qualification criteria. You MUST return ONLY a valid JSON object with a single property "matchedSrNumbers" containing an array of strings representing the SR Numbers of the jobs that are a strong match. Do not include any markdown formatting, explanations, or other text.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite-preview',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            matchedSrNumbers: {
              type: Type.ARRAY,
              items: {
                type: Type.STRING
              },
              description: "An array of the SR Numbers where the candidate's resume is a strong match."
            }
          },
          required: ["matchedSrNumbers"]
        }
      }
    });

    let matchedSrNumbers: string[] = [];
    try {
      const parsed = JSON.parse(response.text || '{}');
      matchedSrNumbers = parsed.matchedSrNumbers || [];
    } catch (e) {
      console.error('Failed to parse JSON response', e);
      console.error('Raw response text:', response.text);
    }
    
    // Filter out any hallucinated SR numbers
    const validSrNumbers = jobs.map((j: any) => j.srNumber);
    matchedSrNumbers = matchedSrNumbers.filter(sr => validSrNumbers.includes(sr));

    res.json({ matchedSrNumbers });
  } catch (error: any) {
    console.error('Error matching jobs:', error);
    if (error.status === 400 && error.message?.includes('API key not valid')) {
      return res.status(500).json({ error: 'The provided Gemini API key is invalid. Please check your API key configuration.' });
    }
    res.status(500).json({ error: 'Failed to match jobs' });
  }
});

// 5. Verify password for database deletion
app.post('/api/verify-password', (req, res) => {
  const { password } = req.body;
  const expectedPassword = process.env.DELETE_PASSWORD || 'cbyk@902';
  
  if (password === expectedPassword) {
    res.json({ valid: true });
  } else {
    res.status(401).json({ error: 'Incorrect password' });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const viteModule = 'vite';
    const { createServer: createViteServer } = await import(viteModule);
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  if (process.env.VERCEL !== '1') {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  }
}

startServer();

export default app;
