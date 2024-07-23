
const express = require('express');
const mysql = require('mysql2/promise');
const { OAuth2Client } = require('google-auth-library');
const session = require('express-session');
const axios = require('axios');

const app = express();
const PORT = 3000;

// Google OAuth2 client setup
const CLIENT_ID = '25366325354-gmtk0k3suegfdlnbf1d9j81t1codhr3k.apps.googleusercontent.com';
const CLIENT_SECRET = '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';
const REDIRECT_URI = 'http://localhost:3000/oauth2callback';
const oauth2Client = new OAuth2Client(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

// MySQL database setup
const dbConfig = {
  host: '35.232.56.51',
  user: 'whiteboxqa',
  password: 'Innovapath1',
  database: 'social_login'
};

async function queryDb(query, params) {
  const connection = await mysql.createConnection(dbConfig);
  const [results] = await connection.execute(query, params);
  await connection.end();
  return results;
}

// Express session setup
app.use(session({
  secret: 'secret',
  resave: false,
  saveUninitialized: true,
}));

// Route for sign in with Google
app.get('/signin', async (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['profile', 'email'],
    prompt: 'select_account' // Forces to select an account for sign-in
  });
  req.session.authType = 'signin';
  res.redirect(url);
});

// Route for sign up with Google
app.get('/signup', (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['profile', 'email'],
    prompt: 'consent' // Forces to select an account for sign-up
  });
  req.session.authType = 'signup';
  res.redirect(url);
});

app.get('/oauth2callback', async (req, res) => {
  const { code } = req.query;
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);

  const ticket = await oauth2Client.verifyIdToken({
    idToken: tokens.id_token,
    audience: CLIENT_ID,
  });
  const payload = ticket.getPayload();
  
  const { sub: googleId, name: displayName, email } = payload;

  let users = await queryDb('SELECT * FROM Users WHERE googleId = ?', [googleId]);
  if (req.session.authType === 'signin') {
    if (users.length === 0) {
      // User not found, redirect to "Please sign up first" page
      return res.redirect('/please-signup');
    } else {
      // Existing user, log them in
      req.session.userId = googleId;
      return res.redirect('/products');
    }
  } else if (req.session.authType === 'signup') {
    if (users.length === 0) {
      // New user, insert into the database
      await queryDb('INSERT INTO Users (googleId, displayName, email) VALUES (?, ?, ?)', [googleId, displayName, email]);
      req.session.userId = googleId;
      return res.redirect('/additional-details'); // Redirect to form
    } else {
      // User already exists, log them in
      req.session.userId = googleId;
      return res.redirect('/products');
    }
  } else {
    return res.redirect('/');
  }
});

// Route for the additional details form
app.get('/additional-details', (req, res) => {
  if (!req.session.userId) {
    return res.redirect('/');
  }

  res.send(`
  <html>
    <head>
      <style>
        label {
          display: block;
          margin-bottom: 5px;
        }
        input[type="text"] {
          width: 100%;
          padding: 8px;
          margin-bottom: 10px;
          border: 1px solid #ccc;
          border-radius: 4px;
          box-sizing: border-box;
        }
        button[type="submit"] {
          background-color: #4CAF50;
          color: white;
          padding: 10px 20px;
          border: none;
          border-radius: 4px;
          cursor: pointer;
        }
        button[type="submit"]:hover {
          background-color: #45a049;
        }
      </style>
    </head>
    <body>
      <form action="/submit-details" method="POST">
        <label for="mobileNumber">Mobile Number:</label>
        <input type="text" id="mobileNumber" name="mobileNumber" required><br>
        <label for="address">Address:</label>
        <input type="text" id="address" name="address" required><br>
        <label for="zip">Zip Code:</label>
        <input type="text" id="zip" name="zip" required><br>
        <button type="submit">Submit</button>
      </form>
    </body>
  </html>
`);
});

// Route to handle form submission
app.post('/submit-details', express.urlencoded({ extended: true }), async (req, res) => {
  const { mobileNumber, address, zip } = req.body;
  const userId = req.session.userId;

  if (!userId) {
    return res.redirect('/');
  }

  await queryDb('UPDATE Users SET mobileNumber = ?, address = ?, zip = ? WHERE googleId = ?', [mobileNumber, address, zip, userId]);
  res.redirect('/products');
});

// Route for user profile
app.get('/profile', async (req, res) => {
  if (!req.session.userId) {
    return res.redirect('/');
  }

  let users = await queryDb('SELECT * FROM Users WHERE googleId = ?', [req.session.userId]);
  if (users.length === 0) {
    return res.redirect('/');
  }

  const user = users[0];
  res.send(`Hello, ${user.displayName}`);
});

// Route for welcome page for new users
app.get('/welcome', async (req, res) => {
  if (!req.session.userId) {
    return res.redirect('/');
  }

  let users = await queryDb('SELECT * FROM Users WHERE googleId = ?', [req.session.userId]);
  if (users.length === 0) {
    return res.redirect('/');
  }

  const user = users[0];
  res.send(`Welcome, ${user.displayName}! Thank you for signing up.`);
});

// Route for "Please sign up first" page
app.get('/please-signup', (req, res) => {
  res.send(`
    <html>
    <style>
    body {
      font-family: Arial, sans-serif;
      margin: 0;
      padding: 0;
      background-color: #f4f4f4;
    }
    .container {
      max-width: 600px;
      margin: 50px auto;
      padding: 20px;
      background-color: #fff;
      border-radius: 5px;
      box-shadow: 0 0 10px rgba(0,0,0,0.1);
    }
    h1 {
      text-align: center;
      color: #333;
    }
    a {
      display: block;
      width: 200px;
      margin: 20px auto;
      padding: 10px;
      text-align: center;
      color: #fff;
      background-color: #007bff;
      border-radius: 5px;
      text-decoration: none;
    }
    a:hover {
      background-color: #0056b3;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Please sign up first before accessing your Whitebox account</h1>
    <a href="/signup">Sign Up with Google</a>
  </div>
</body>
    </html>
  `);
});

// Route to redirect to products after sign in
app.get('/products', async (req, res) => {
  if (!req.session.userId) {
    return res.redirect('/');
  }

  let users = await queryDb('SELECT * FROM Users WHERE googleId = ?', [req.session.userId]);
  if (users.length === 0) {
    return res.redirect('/');
  }

  // Fetch products from the API and display them
  try {
    const response = await axios.get('https://fakestoreapi.com/products');
    const products = response.data;

    let productHtml = products.map(product => `
      <div>
        <h2>${product.title}</h2>
        <p>${product.description}</p>
        <p>Price: $${product.price}</p>
      </div>
    `).join('');

    res.send(`
      <html>
        <body>
          <h1>Products</h1>
          ${productHtml}
        </body>
      </html>
    `);
  } catch (error) {
    res.status(500).send('Error fetching products');
  }
});

// Static files for the buttons
app.get('/', (req, res) => {
  res.send(`
    <html>
      <head>
        
      </head>
      <body>
        <a href="/signin" class="button">Sign In with Google</a>
        <br><br>
        <a href="/signup" class="button">Sign Up with Google</a>
      </body>
    </html>
  `);
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
