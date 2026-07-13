import { createClient } from '@supabase/supabase-js';
import defaultQuestions from '../../questions.json';

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    try {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('quiz_questions')
        .select('data')
        .eq('id', 1)
        .single();
      if (error || !data) return res.status(200).json(defaultQuestions);
      return res.status(200).json(data.data);
    } catch (e) {
      return res.status(500).json({ error: 'Failed to read questions' });
    }
  }

  if (req.method === 'POST') {
    try {
      const body = req.body;
      const supabase = getSupabase();
      const { error } = await supabase
        .from('quiz_questions')
        .upsert({ id: 1, data: body });
      if (error) throw error;
      return res.status(200).json(body);
    } catch (e) {
      return res.status(500).json({ error: 'Failed to save questions' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
