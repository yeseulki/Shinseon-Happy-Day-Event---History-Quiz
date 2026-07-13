import { createClient } from '@supabase/supabase-js';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { filename, contentType, data } = req.body;
  if (!filename || !contentType || !data) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const buffer = Buffer.from(data, 'base64');
    const supabase = getSupabase();

    // 파일명 중복 방지: 타임스탬프 prefix
    const ext = filename.split('.').pop();
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `hints/${Date.now()}_${safeName}`;

    const { error } = await supabase.storage
      .from('quiz-images')
      .upload(storagePath, buffer, {
        contentType,
        upsert: false,
      });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    const { data: urlData } = supabase.storage
      .from('quiz-images')
      .getPublicUrl(storagePath);

    return res.status(200).json({ url: urlData.publicUrl });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
