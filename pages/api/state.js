// In-memory fallback for dev or when KV not configured
let memState = {
  phase: 'idle',
  teamId: 1,
  questionIndex: 0,
  questionId: null,
  timerStartedAt: null,
  timerTotal: 90,
  solvedIds: [],
};

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    try {
      const { kv } = await import('@vercel/kv');
      const state = await kv.get('quiz:state');
      res.json(state || memState);
    } catch {
      res.json(memState);
    }
  } else if (req.method === 'POST') {
    const update = req.body;
    try {
      const { kv } = await import('@vercel/kv');
      const current = await kv.get('quiz:state') || memState;
      const newState = { ...current, ...update };
      await kv.set('quiz:state', newState, { ex: 86400 });
      memState = newState;
      res.json(newState);
    } catch {
      memState = { ...memState, ...update };
      res.json(memState);
    }
  } else {
    res.setHeader('Allow', ['GET', 'POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
