const express = require('express');
const path = require('path');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const app = express();

// Task 1: Middleware to parse JSON request bodies
app.use(express.json());

// Secret key stored as constant (to be moved to .env in Lab 8)
const SECRET_KEY = 'MY_SECRET_TOKEN';

const dbPath = path.join(__dirname, 'userData.db');
let db = null;

// Initialize Database connection and create user table
const initializeDBAndServer = async (port = process.env.PORT || 3000) => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });

    // Task 2: Create a user table with unique username, name, and hashed password column
    await db.run(`
      CREATE TABLE IF NOT EXISTS user (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        password TEXT NOT NULL
      );
    `);

    if (process.env.NODE_ENV !== 'test') {
      const server = app.listen(port, () => {
        console.log(`Server Running at http://localhost:${port}/`);
      });
      return server;
    }
  } catch (error) {
    console.error(`Database Error: ${error.message}`);
    process.exit(1);
  }
};

// Root route for health check and welcome message
app.get('/', (request, response) => {
  response.send({
    message: 'Lab 4: Registration, Login and JWT Authentication API is Running',
    endpoints: {
      register: 'POST /register/ or POST /register',
      login: 'POST /login/ or POST /login',
    },
  });
});

/**
 * Task 3: POST /register/
 * - Reject existing username with 400 Bad Request
 * - Otherwise hash password with bcrypt.hash and save user using parameterized query
 */
app.post(['/register', '/register/'], async (request, response) => {
  const { username, name, password } = request.body;

  if (!username || !password || !name) {
    return response.status(400).send('Please provide username, name, and password');
  }

  try {
    // Parameterized query to check if user already exists
    const selectUserQuery = `SELECT * FROM user WHERE username = ?;`;
    const dbUser = await db.get(selectUserQuery, [username]);

    if (dbUser !== undefined) {
      // User already exists
      response.status(400).send('User already exists');
    } else {
      // Hash password using bcrypt (salt rounds = 10)
      const hashedPassword = await bcrypt.hash(password, 10);

      // Parameterized query to insert new user
      const createUserQuery = `
        INSERT INTO user (username, name, password)
        VALUES (?, ?, ?);
      `;
      await db.run(createUserQuery, [username, name, hashedPassword]);
      response.status(200).send('User created successfully');
    }
  } catch (error) {
    response.status(500).send(`Server Error: ${error.message}`);
  }
});

/**
 * Task 4 & 5: POST /login/
 * - Return 400 for unknown user
 * - Compare password with bcrypt.compare; return 400 for wrong password
 * - On success, return { jwt_token } created with jwt.sign containing only username in payload
 */
app.post(['/login', '/login/'], async (request, response) => {
  const { username, password } = request.body;

  if (!username || !password) {
    return response.status(400).send('Please provide username and password');
  }

  try {
    // Parameterized query to fetch user by username
    const selectUserQuery = `SELECT * FROM user WHERE username = ?;`;
    const dbUser = await db.get(selectUserQuery, [username]);

    if (dbUser === undefined) {
      // Unknown user
      response.status(400).send('Invalid user');
    } else {
      // Compare submitted plain password with stored bcrypt hash
      const isPasswordMatched = await bcrypt.compare(password, dbUser.password);

      if (isPasswordMatched === true) {
        // Task 5: Only username in payload (never password)
        const payload = { username: username };
        const jwtToken = jwt.sign(payload, SECRET_KEY);
        response.status(200).send({ jwt_token: jwtToken });
      } else {
        // Wrong password
        response.status(400).send('Invalid password');
      }
    }
  } catch (error) {
    response.status(500).send(`Server Error: ${error.message}`);
  }
});

// Helper for testing to expose db
app.getDb = () => db;

// Start server if run directly
if (require.main === module) {
  initializeDBAndServer();
}

module.exports = { app, initializeDBAndServer, SECRET_KEY };
