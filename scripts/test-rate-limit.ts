async function testRateLimit() {
  const url = 'http://localhost:3000/api/upload'; // Testing against /api/upload
  console.log(`Starting rate limit test against ${url}...`);

  for (let i = 1; i <= 15; i++) {
    try {
      const res = await fetch(url, { method: 'GET' });
      const status = res.status;
      const body = await res.json().catch(() => ({}));
      
      console.log(`Request ${i}: Status ${status}`, body);

      if (status === 429) {
        console.log('SUCCESS: Rate limit hit at request', i);
        return;
      }
    } catch (error: any) {
      console.error(`Request ${i} failed:`, error.message);
    }
  }
}

testRateLimit();
