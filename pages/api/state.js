import { createClient } from '@supabase/supabase-js';

const defaultState = {
  phase: 'idle',
  teamId: 1,
  questionIndex: 0,
  questionId: null,
  timerStartedAt: null,
  timerTotal: 90,
  solvedIds: [],
};

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('quiz_state')
      .select('state')
      .eq('id', 1)
      .single();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data.state || defaultState);
  } else if (req.method === 'POST') {
    const update = req.body;
    const supabase = getSupabase();
    const { data: current, error: fetchError } = await supabase
      .from('quiz_state')
      .select('state')
      .eq('id', 1)
      .single();
    if (fetchError) return res.status(500).json({ error: fetchError.message });
    const newState = { ...(current.state || defaultState), ...update };
    const { error: updateError } = await supabase
      .from('quiz_state')
      .update({ state: newState })
      .eq('id', 1);
    if (updateError) return res.status(500).json({ error: updateError.message });
    res.json(newState);
  } else {
    res.setHeader('Allow', ['GET', 'POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
