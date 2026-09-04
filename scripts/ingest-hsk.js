const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// Read .env from backend
const envPath = path.resolve(__dirname, '../.env');
const envStr = fs.readFileSync(envPath, 'utf8');
const env = {};
envStr.split('\n').forEach(line => {
  const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (m) {
    let val = m[2] || '';
    val = val.trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[m[1]] = val;
  }
});

const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = env.SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_KEY || env.SUPABASE_ANON_KEY;
const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

const DATA_DIR = path.resolve(__dirname, '../data/hsk-exams');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchBuffer(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`Failed to fetch ${url}, status: ${res.statusCode}`));
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

function fetchJson(url) {
  return fetchBuffer(url).then(buf => JSON.parse(buf.toString('utf8')));
}

function postJson(url, data) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(data);
    const req = https.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'User-Agent': 'Mozilla/5.0'
      }
    }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch(e) {
          resolve(body);
        }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

// Upload buffer to Supabase Storage bucket 'hsk-exams'
async function uploadToSupabase(storagePath, buffer, contentType) {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.storage
      .from('hsk-exams')
      .upload(storagePath, buffer, {
        contentType,
        upsert: true
      });
    if (error) {
      console.warn(`[Supabase Upload Warn] ${storagePath}: ${error.message}`);
      return null;
    }
    const { data: publicUrlData } = supabase.storage
      .from('hsk-exams')
      .getPublicUrl(storagePath);
    return publicUrlData?.publicUrl || null;
  } catch (err) {
    console.warn(`[Supabase Upload Err] ${storagePath}: ${err.message}`);
    return null;
  }
}

async function ingest() {
  console.log('--- 1. Ingesting Levels & Exam Lists ---');
  const levelsData = await fetchJson('https://api.xiehanzi.com/api/v1/hsk-tests/levels');
  fs.writeFileSync(path.join(DATA_DIR, 'levels.json'), JSON.stringify(levelsData, null, 2), 'utf8');
  console.log('Saved levels.json with levels:', levelsData.levels.map(l => `HSK ${l.level}: ${l.count} tests`).join(', '));

  const allExamsList = [];

  for (const lvl of levelsData.levels) {
    const levelTests = await fetchJson(`https://api.xiehanzi.com/api/v1/hsk-tests/levels/${lvl.level}`);
    fs.writeFileSync(path.join(DATA_DIR, `level-${lvl.level}.json`), JSON.stringify(levelTests, null, 2), 'utf8');
    console.log(`Saved level-${lvl.level}.json (${levelTests.items.length} items)`);
    allExamsList.push(...levelTests.items);
  }
  fs.writeFileSync(path.join(DATA_DIR, 'all-exams.json'), JSON.stringify(allExamsList, null, 2), 'utf8');
  console.log(`Total exams saved: ${allExamsList.length}`);

  // Ingest tests for HSK 1 and HSK 2 first for instant usability
  console.log('\n--- 2. Ingesting Detailed Tests & Uploading to Supabase ---');
  const targetTests = allExamsList.filter(t => t.level === 1 || t.level === 2);
  console.log(`Processing ${targetTests.length} tests for HSK 1 & 2...`);

  for (let i = 0; i < targetTests.length; i++) {
    const testItem = targetTests[i];
    const testId = testItem.testId;
    const testFile = path.join(DATA_DIR, `${testId}.json`);

    // If file already exists and has audioUrl, skip or reuse
    if (fs.existsSync(testFile)) {
      console.log(`[${i + 1}/${targetTests.length}] Test ${testId} already ingested, skipping.`);
      continue;
    }

    console.log(`\n[${i + 1}/${targetTests.length}] Ingesting test ${testId} (${testItem.title})...`);
    
    // Fetch test details
    const testDetail = await fetchJson(`https://api.xiehanzi.com/api/v1/hsk-tests/levels/${testItem.level}/${testId}`);
    
    // Fetch official grade answer keys
    let gradeKey = null;
    try {
      gradeKey = await postJson(`https://api.xiehanzi.com/api/v1/hsk-tests/${testId}/grade`, { answers: {} });
    } catch(e) {
      console.warn(`Failed to fetch grade key for ${testId}:`, e.message);
    }

    // Map of answers: id -> answer
    const answerMap = {};
    if (gradeKey && gradeKey.sections) {
      gradeKey.sections.forEach(sec => {
        sec.questions.forEach(q => {
          if (q.answer) answerMap[q.id] = q.answer;
        });
      });
    }

    // 1. Upload Main Audio
    let supabaseAudioUrl = testDetail.audioUrl;
    if (testDetail.audioUrl && supabase) {
      try {
        console.log(`  Downloading main audio: ${testDetail.audioUrl}`);
        const audioBuf = await fetchBuffer(testDetail.audioUrl);
        const uploadedUrl = await uploadToSupabase(`audios/${testId}.mp3`, audioBuf, 'audio/mpeg');
        if (uploadedUrl) {
          console.log(`  ✓ Main audio uploaded to Supabase: ${uploadedUrl}`);
          supabaseAudioUrl = uploadedUrl;
        }
      } catch (err) {
        console.warn(`  Could not upload audio for ${testId}:`, err.message);
      }
    }

    // 2. Upload Images
    const imageMapping = {};
    if (testDetail.images && testDetail.images.length > 0 && supabase) {
      console.log(`  Processing ${testDetail.images.length} images...`);
      for (const imgObj of testDetail.images) {
        const remoteSrc = imgObj.src;
        const filename = path.basename(imgObj.path);
        try {
          const imgBuf = await fetchBuffer(remoteSrc);
          const ext = filename.split('.').pop() || 'jpeg';
          const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
          const uploadedImgUrl = await uploadToSupabase(`images/${testId}/${filename}`, imgBuf, mime);
          if (uploadedImgUrl) {
            imageMapping[imgObj.path] = uploadedImgUrl;
          }
        } catch (err) {
          console.warn(`    Failed to upload image ${filename}:`, err.message);
        }
      }
      console.log(`  ✓ Uploaded ${Object.keys(imageMapping).length} images to Supabase.`);
    }

    // Replace images and answers in questions
    if (testDetail.sections) {
      testDetail.sections.forEach(sec => {
        if (sec.questions) {
          sec.questions.forEach(q => {
            // Attach correct answer
            if (answerMap[q.id]) {
              q.correctAnswer = answerMap[q.id];
            }
            // Update image URLs
            if (q.images && q.images.length > 0) {
              q.imageUrls = q.images.map(imgRel => {
                if (imageMapping[imgRel]) return imageMapping[imgRel];
                const found = testDetail.images?.find(item => item.path === imgRel);
                return found ? found.src : `https://static.xiehanzi.com/hsk-tests/${testId}/${imgRel}`;
              });
            } else {
              q.imageUrls = [];
            }
          });
        }
      });
    }

    // Construct final clean exam object
    const finalExam = {
      testId: testDetail.testId,
      level: testDetail.level,
      title: testDetail.title,
      durationMinutes: testItem.durationMinutes || (testDetail.level === 1 ? 35 : 50),
      questionCount: testDetail.questionCount || (testItem.questionCount || 40),
      listeningQuestionCount: testItem.listeningQuestionCount,
      readingQuestionCount: testItem.readingQuestionCount,
      writingQuestionCount: testItem.writingQuestionCount,
      audioUrl: supabaseAudioUrl,
      sections: testDetail.sections,
      answerMap: answerMap,
      syncedAt: new Date().toISOString()
    };

    fs.writeFileSync(testFile, JSON.stringify(finalExam, null, 2), 'utf8');
    console.log(`  ✓ Successfully saved ${testId}.json`);
  }

  console.log('\n=============================================');
  console.log('HSK Exam Ingestion completed successfully!');
  console.log('=============================================');
}

ingest().catch(err => {
  console.error('Ingestion failed:', err);
  process.exit(1);
});
