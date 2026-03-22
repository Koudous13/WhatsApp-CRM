const key = 'AIzaSyDTol_k-pT7_mCyQgHajtEhTK2U14tCRPU';
const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${key}`;

async function test() {
  console.log('Testing connectivity to Gemini...');
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: { parts: [{ text: 'test' }] } }),
    });
    const json = await res.json();
    if (res.ok) {
      console.log('✅ Success! Connection working.');
      console.log('Embedding length:', json.embedding.values.length);
    } else {
      console.log('❌ API Error:', json);
    }
  } catch (e) {
    console.log('❌ Network Error (fetch failed):', e.message);
  }
}

test();
