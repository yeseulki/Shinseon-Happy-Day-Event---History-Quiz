import fs from 'fs';
import path from 'path';

const DATA_PATH = path.join(process.cwd(), 'questions.json');
const PUBLIC_PATH = path.join(process.cwd(), 'public', 'questions.json');

export default async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const raw = fs.readFileSync(DATA_PATH, 'utf-8');
      return res.status(200).json(JSON.parse(raw));
    } catch (e) {
      return res.status(500).json({ error: 'Failed to read questions' });
    }
  }

  if (req.method === 'POST') {
    try {
      const body = req.body;
      // body should be the full questions JSON object
      const json = JSON.stringify(body, null, 2);
      fs.writeFileSync(DATA_PATH, json, 'utf-8');
      fs.writeFileSync(PUBLIC_PATH, json, 'utf-8');
      return res.status(200).json(body);
    } catch (e) {
      return res.status(500).json({ error: 'Failed to save questions' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
