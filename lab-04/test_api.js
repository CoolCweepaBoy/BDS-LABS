const http = require('http');
const jwt = require('jsonwebtoken');
const { app, initializeDBAndServer, SECRET_KEY } = require('./app');

const PORT = 3005;

// Helper to send HTTP requests to test server
function makeRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const dataString = body ? JSON.stringify(body) : '';
    const req = http.request(
      {
        hostname: 'localhost',
        port: PORT,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(dataString),
        },
      },
      (res) => {
        let responseBody = '';
        res.on('data', (chunk) => {
          responseBody += chunk;
        });
        res.on('end', () => {
          let parsedJson = null;
          try {
            parsedJson = JSON.parse(responseBody);
          } catch (_) {}
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: responseBody,
            json: parsedJson,
          });
        });
      }
    );
    req.on('error', reject);
    if (dataString) {
      req.write(dataString);
    }
    req.end();
  });
}

async function runTests() {
  console.log('==================================================');
  console.log('  RUNNING LAB 4 COMPREHENSIVE TEST SUITE');
  console.log('==================================================\n');

  process.env.NODE_ENV = 'test';
  await initializeDBAndServer();

  const server = app.listen(PORT, () => {
    console.log(`Test server running on port ${PORT}\n`);
  });

  const db = app.getDb();
  // Clear any existing test data for a clean test run
  await db.run('DELETE FROM user WHERE username IN (?, ?);', ['ashraf', 'rahul']);

  let passed = 0;
  let total = 0;

  function assert(title, condition, extraInfo = '') {
    total++;
    if (condition) {
      passed++;
      console.log(`\x1b[32m✔ [PASS]\x1b[0m ${title}`);
    } else {
      console.error(`\x1b[31m✖ [FAIL]\x1b[0m ${title} -> ${extraInfo}`);
    }
  }

  try {
    // 1. Health check
    const rootRes = await makeRequest('GET', '/', null);
    assert('GET / responds with status 200', rootRes.statusCode === 200);

    // 2. Register valid user
    const regPayload = {
      username: 'ashraf',
      name: 'Pattan Ashraf Khan',
      password: 'SecurePassword123!',
    };
    const regRes = await makeRequest('POST', '/register/', regPayload);
    assert(
      'POST /register/ creates new user (Status 200)',
      regRes.statusCode === 200 && regRes.body === 'User created successfully',
      `Got status: ${regRes.statusCode}, body: ${regRes.body}`
    );

    // 3. Register duplicate user
    const dupRegRes = await makeRequest('POST', '/register/', regPayload);
    assert(
      'POST /register/ rejects duplicate username with 400',
      dupRegRes.statusCode === 400 && dupRegRes.body === 'User already exists',
      `Got status: ${dupRegRes.statusCode}, body: ${dupRegRes.body}`
    );

    // 4. Login unknown user
    const unknownLoginRes = await makeRequest('POST', '/login/', {
      username: 'unknown_user_999',
      password: 'SomePassword!',
    });
    assert(
      'POST /login/ returns 400 for unknown user',
      unknownLoginRes.statusCode === 400 && unknownLoginRes.body === 'Invalid user',
      `Got status: ${unknownLoginRes.statusCode}, body: ${unknownLoginRes.body}`
    );

    // 5. Login wrong password
    const wrongPassRes = await makeRequest('POST', '/login/', {
      username: 'ashraf',
      password: 'WrongPassword!',
    });
    assert(
      'POST /login/ returns 400 for wrong password',
      wrongPassRes.statusCode === 400 && wrongPassRes.body === 'Invalid password',
      `Got status: ${wrongPassRes.statusCode}, body: ${wrongPassRes.body}`
    );

    // 6. Login success and JWT token verification
    const successLoginRes = await makeRequest('POST', '/login/', {
      username: 'ashraf',
      password: 'SecurePassword123!',
    });
    const hasToken =
      successLoginRes.statusCode === 200 &&
      successLoginRes.json &&
      typeof successLoginRes.json.jwt_token === 'string';
    assert(
      'POST /login/ returns 200 and { jwt_token } on success',
      hasToken,
      `Got status: ${successLoginRes.statusCode}, json: ${JSON.stringify(successLoginRes.json)}`
    );

    if (hasToken) {
      const token = successLoginRes.json.jwt_token;
      const decodedPayload = jwt.verify(token, SECRET_KEY);
      assert(
        'JWT token contains ONLY username in payload (no password)',
        decodedPayload.username === 'ashraf' && decodedPayload.password === undefined,
        `Payload: ${JSON.stringify(decodedPayload)}`
      );

      const decodedComplete = jwt.decode(token, { complete: true });
      assert(
        'JWT token header has alg HS256 and typ JWT',
        decodedComplete.header.alg === 'HS256' && decodedComplete.header.typ === 'JWT',
        `Header: ${JSON.stringify(decodedComplete.header)}`
      );
    }

    // 7. Verify SQLite Database stores Bcrypt hash only (never plain text)
    const dbRow = await db.get('SELECT * FROM user WHERE username = ?;', ['ashraf']);
    const isHashed = dbRow && dbRow.password.startsWith('$2b$10$');
    const isNotPlain = dbRow && dbRow.password !== 'SecurePassword123!';
    assert(
      'Database stores bcrypt hash only (starts with $2b$10$, never plain text)',
      isHashed && isNotPlain,
      `Stored password: ${dbRow ? dbRow.password : 'none'}`
    );

    console.log('\n==================================================');
    console.log(`  TEST RESULTS: ${passed}/${total} PASSED`);
    console.log('==================================================\n');
  } finally {
    server.close();
  }
}

runTests().catch((err) => {
  console.error('Test run failed:', err);
  process.exit(1);
});
