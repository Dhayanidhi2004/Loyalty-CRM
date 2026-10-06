// File storage: Supabase Storage when SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set,
// otherwise the local ./uploads folder (handy for offline development).
const fs = require('fs');
const path = require('path');

const BUCKET = process.env.SUPABASE_BUCKET || 'crm-files';
const localDir = path.join(__dirname, '..', 'uploads');

let supabase = null;
if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
  const { createClient } = require('@supabase/supabase-js');
  supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

let bucketReady = null;
function ensureBucket() {
  if (!bucketReady) {
    bucketReady = (async () => {
      const { data } = await supabase.storage.getBucket(BUCKET);
      if (!data) {
        const { error } = await supabase.storage.createBucket(BUCKET, { public: true, fileSizeLimit: '10MB' });
        if (error && !/already exists/i.test(error.message)) throw error;
      }
    })().catch((e) => {
      bucketReady = null;
      throw e;
    });
  }
  return bucketReady;
}

function safeName(original) {
  const clean = original.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
  return `${Date.now()}-${Math.round(Math.random() * 1e6)}-${clean}`;
}

// file = multer memory file { buffer, originalname, mimetype }
async function saveFile(file, folder = 'misc') {
  const name = safeName(file.originalname);
  if (supabase) {
    await ensureBucket();
    const key = `${folder}/${name}`;
    const { error } = await supabase.storage.from(BUCKET).upload(key, file.buffer, { contentType: file.mimetype, upsert: false });
    if (error) throw error;
    return supabase.storage.from(BUCKET).getPublicUrl(key).data.publicUrl;
  }
  fs.mkdirSync(localDir, { recursive: true });
  fs.writeFileSync(path.join(localDir, name), file.buffer);
  return `/uploads/${name}`;
}

module.exports = { saveFile, localDir, usingSupabaseStorage: !!supabase };
