# Backend Security Implementation Guide

## ⚠️ Critical Notice

**Frontend security enhancements have been implemented, but they are NOT a replacement for backend security.**

Frontend validation can be completely bypassed by:
- Browser developer tools
- Direct API calls (curl, Postman, scripts)
- Modified JavaScript
- Man-in-the-middle attacks

**This guide outlines the required backend changes to enforce the security measures implemented on the frontend.**

---

## 📋 Implementation Priority

### 🔴 CRITICAL (Implement Immediately)
1. Server-side input validation
2. SQL/NoSQL injection prevention
3. Server-side rate limiting
4. JWT validation on all protected routes
5. Password hashing (bcrypt/argon2)

### 🟡 IMPORTANT (Implement Soon)
1. CSRF protection
2. CORS configuration
3. OAuth state validation
4. Security headers (helmet)
5. HTTPS enforcement in production

### 🟢 RECOMMENDED (Enhanced Security)
1. Request size limits
2. Logging and monitoring
3. Account lockout mechanisms
4. IP-based rate limiting
5. Two-factor authentication

---

## 🔒 Required Backend Security Measures

### 1. Input Validation (CRITICAL)

The frontend validates inputs, but **backend MUST validate all inputs** independently.

#### Email Validation
```typescript
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 254;
}

// In your route
if (!isValidEmail(req.body.email)) {
  return res.status(400).json({ message: 'Invalid email format' });
}
```

#### Username Validation
```typescript
function isValidUsername(username: string): boolean {
  const usernameRegex = /^[a-zA-Z0-9_-]{3,20}$/;
  return usernameRegex.test(username);
}

// Frontend enforces: 3-20 characters, alphanumeric + underscores/hyphens only
if (!isValidUsername(req.body.username)) {
  return res.status(400).json({ message: 'Invalid username format' });
}
```

#### Password Validation
```typescript
function isValidPassword(password: string): boolean {
  return password.length >= 8 && password.length <= 128;
}

// Frontend enforces: 8-128 characters
if (!isValidPassword(req.body.password)) {
  return res.status(400).json({ message: 'Password must be 8-128 characters' });
}
```

#### UUID Validation
```typescript
function isValidUUID(id: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}

// Frontend validates all IDs - backend must too
if (!isValidUUID(req.params.id)) {
  return res.status(400).json({ message: 'Invalid ID format' });
}
```

### 2. Rate Limiting (CRITICAL)

Frontend has client-side rate limiting, but it's easily bypassed.

#### Install Dependencies
```bash
npm install express-rate-limit
```

#### Implementation
```typescript
import rateLimit from 'express-rate-limit';

// Login/Register - 5 attempts per 5 minutes
const authLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 5,
  message: 'Too many attempts. Please try again in 5 minutes.',
  standardHeaders: true,
  legacyHeaders: false,
});

// General API - 30 requests per minute
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: 'Too many requests. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply to routes
app.post('/api/auth/login', authLimiter, loginHandler);
app.post('/api/auth/register', authLimiter, registerHandler);
app.use('/api/', apiLimiter);
```

### 3. CSRF Protection

Frontend sends `X-Requested-With: XMLHttpRequest` header.

#### Middleware
```typescript
function csrfProtection(req, res, next) {
  const csrfHeader = req.headers['x-requested-with'];
  
  if (!csrfHeader || csrfHeader !== 'XMLHttpRequest') {
    return res.status(403).json({ message: 'Invalid request origin' });
  }
  
  next();
}

// Apply to all API routes
app.use('/api/', csrfProtection);
```

### 4. CORS Configuration

Frontend uses `credentials: 'same-origin'`.

```typescript
import cors from 'cors';

const corsOptions = {
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']
};

app.use(cors(corsOptions));
```

### 5. JWT Security

#### Token Generation
```typescript
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

// Use strong secret from environment
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex');
const JWT_EXPIRES_IN = '24h';

function generateToken(user) {
  // Include minimal necessary data
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      username: user.username,
      admin: user.admin,
      iat: Math.floor(Date.now() / 1000)
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}
```

#### Token Validation Middleware
```typescript
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      // Token expired or invalid
      return res.status(401).json({ message: 'Invalid or expired token' });
    }
    
    req.user = user;
    next();
  });
}

// Apply to protected routes
app.get('/api/auth/me', authenticateToken, getUserHandler);
app.post('/api/matches', authenticateToken, createMatchHandler);
```

### 6. OAuth State Validation

Frontend validates OAuth state parameter - backend should too.

```typescript
import crypto from 'crypto';

// When initiating OAuth connection
app.get('/api/challonge/connect', authenticateToken, async (req, res) => {
  try {
    // Generate cryptographically secure state
    const state = crypto.randomBytes(32).toString('hex');
    
    // Store state in session or database with expiration
    await saveOAuthState(req.user.id, state, 10 * 60 * 1000); // 10 min expiry
    
    const authUrl = `https://api.challonge.com/oauth/authorize?...&state=${state}`;
    
    res.json({ authorizationUrl: authUrl, state });
  } catch (error) {
    res.status(500).json({ message: 'Failed to initiate OAuth' });
  }
});

// On OAuth callback
app.post('/api/challonge/callback', authenticateToken, async (req, res) => {
  const { code, state } = req.body;
  
  // Validate state
  const storedState = await getOAuthState(req.user.id);
  
  if (!storedState || storedState !== state) {
    return res.status(403).json({ message: 'Invalid state parameter - possible CSRF attack' });
  }
  
  // Clear used state
  await deleteOAuthState(req.user.id);
  
  // Proceed with token exchange...
});
```

### 7. Security Headers

```bash
npm install helmet
```

```typescript
import helmet from 'helmet';

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", process.env.FRONTEND_URL],
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  noSniff: true,
  xssFilter: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));
```

### 8. SQL/NoSQL Injection Prevention

#### Using Parameterized Queries (PostgreSQL)
```typescript
// ❌ NEVER DO THIS
const query = `SELECT * FROM users WHERE email = '${email}'`;

// ✅ ALWAYS DO THIS
const query = 'SELECT * FROM users WHERE email = $1';
const result = await db.query(query, [email]);
```

#### Using ORM (Prisma/TypeORM)
```typescript
// ✅ ORMs automatically prevent SQL injection
const user = await prisma.user.findUnique({
  where: { email: email }
});
```

#### MongoDB with Mongoose
```typescript
// ✅ Mongoose sanitizes by default
const user = await User.findOne({ email: email });
```

---

## 🎯 Endpoint-Specific Requirements

### Authentication Endpoints

#### POST /api/auth/register
```typescript
app.post('/api/auth/register', authLimiter, async (req, res) => {
  try {
    const { email, password, username } = req.body;
    
    // Validate inputs
    if (!isValidEmail(email)) {
      return res.status(400).json({ message: 'Invalid email format' });
    }
    
    if (!isValidPassword(password)) {
      return res.status(400).json({ message: 'Password must be 8-128 characters' });
    }
    
    if (!isValidUsername(username)) {
      return res.status(400).json({ message: 'Username must be 3-20 alphanumeric characters' });
    }
    
    // Check if user exists
    const existingUser = await User.findOne({ 
      $or: [{ email }, { username }] 
    });
    
    if (existingUser) {
      return res.status(409).json({ message: 'Email or username already exists' });
    }
    
    // Hash password (NEVER store plaintext)
    const hashedPassword = await bcrypt.hash(password, 12);
    
    // Create user
    const user = await User.create({
      email: email.toLowerCase().trim(),
      username: username.trim(),
      password: hashedPassword,
      elo: 1200,
      admin: false
    });
    
    res.status(201).json({ message: 'Account created successfully' });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'An error occurred during registration' });
  }
});
```

#### POST /api/auth/login
```typescript
app.post('/api/auth/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Validate inputs
    if (!isValidEmail(email)) {
      return res.status(400).json({ message: 'Invalid email format' });
    }
    
    // Find user
    const user = await User.findOne({ email: email.toLowerCase() });
    
    if (!user) {
      // Don't reveal if email exists
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    
    // Verify password
    const validPassword = await bcrypt.compare(password, user.password);
    
    if (!validPassword) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    
    // Generate token
    const token = generateToken(user);
    
    res.json({ token });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'An error occurred during login' });
  }
});
```

#### GET /api/auth/me
```typescript
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    // req.user comes from JWT
    const user = await User.findById(req.user.id).select('-password');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.json(user);
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ message: 'An error occurred' });
  }
});
```

### Match Endpoints

#### POST /api/matches
```typescript
app.post('/api/matches', authenticateToken, apiLimiter, async (req, res) => {
  try {
    const { player1Id, player2Id } = req.body;
    
    // Validate UUIDs
    if (!isValidUUID(player1Id) || !isValidUUID(player2Id)) {
      return res.status(400).json({ message: 'Invalid player ID format' });
    }
    
    // Validate different players
    if (player1Id === player2Id) {
      return res.status(400).json({ message: 'Players must be different' });
    }
    
    // Verify both players exist
    const [player1, player2] = await Promise.all([
      User.findById(player1Id),
      User.findById(player2Id)
    ]);
    
    if (!player1 || !player2) {
      return res.status(404).json({ message: 'One or both players not found' });
    }
    
    // Check authorization (admin only or involved players)
    if (!req.user.admin && 
        req.user.id !== player1Id && 
        req.user.id !== player2Id) {
      return res.status(403).json({ message: 'Not authorized to create this match' });
    }
    
    // Create match
    const match = await Match.create({
      player1Id,
      player2Id,
      createdAt: new Date()
    });
    
    res.status(201).json(match);
  } catch (error) {
    console.error('Create match error:', error);
    res.status(500).json({ message: 'An error occurred' });
  }
});
```

#### POST /api/matches/:id/complete
```typescript
app.post('/api/matches/:id/complete', authenticateToken, apiLimiter, async (req, res) => {
  try {
    const { id } = req.params;
    const { winnerId } = req.body;
    
    // Validate UUIDs
    if (!isValidUUID(id) || !isValidUUID(winnerId)) {
      return res.status(400).json({ message: 'Invalid ID format' });
    }
    
    // Find match
    const match = await Match.findById(id);
    
    if (!match) {
      return res.status(404).json({ message: 'Match not found' });
    }
    
    // Check if already completed
    if (match.completedAt) {
      return res.status(400).json({ message: 'Match already completed' });
    }
    
    // Validate winner is a participant
    if (winnerId !== match.player1Id && winnerId !== match.player2Id) {
      return res.status(400).json({ message: 'Winner must be a match participant' });
    }
    
    // Check authorization (admin only or involved players)
    if (!req.user.admin && 
        req.user.id !== match.player1Id && 
        req.user.id !== match.player2Id) {
      return res.status(403).json({ message: 'Not authorized to complete this match' });
    }
    
    // Calculate ELO changes
    const { player1EloChange, player2EloChange } = calculateEloChanges(
      match.player1.elo,
      match.player2.elo,
      winnerId
    );
    
    // Update match and player ELOs in transaction
    await db.transaction(async (trx) => {
      await trx.update('matches')
        .set({
          winner: winnerId,
          completedAt: new Date(),
          player1EloChange,
          player2EloChange
        })
        .where('id', id);
      
      await trx.update('users')
        .set({ elo: db.raw('elo + ?', [player1EloChange]) })
        .where('id', match.player1Id);
      
      await trx.update('users')
        .set({ elo: db.raw('elo + ?', [player2EloChange]) })
        .where('id', match.player2Id);
    });
    
    res.json({ message: 'Match completed successfully' });
  } catch (error) {
    console.error('Complete match error:', error);
    res.status(500).json({ message: 'An error occurred' });
  }
});
```

### Tournament Endpoints

#### POST /api/challonge/tournaments/:id/join
```typescript
app.post('/api/challonge/tournaments/:id/join', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validate tournament ID format (depends on Challonge API)
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ message: 'Invalid tournament ID' });
    }
    
    // Check if user has Challonge connected
    const challongeConnection = await ChallongeAuth.findOne({
      userId: req.user.id
    });
    
    if (!challongeConnection || !challongeConnection.accessToken) {
      return res.status(403).json({ 
        message: 'Challonge account not connected' 
      });
    }
    
    // Check token expiration
    if (challongeConnection.expiresAt < new Date()) {
      return res.status(403).json({ 
        message: 'Challonge token expired. Please reconnect.' 
      });
    }
    
    // Call Challonge API to join tournament
    // ... implementation depends on Challonge API
    
    res.json({ message: 'Successfully joined tournament' });
  } catch (error) {
    console.error('Join tournament error:', error);
    res.status(500).json({ message: 'An error occurred' });
  }
});
```

---

## 🔐 Additional Security Measures

### 1. Password Hashing
```typescript
import bcrypt from 'bcrypt';

const SALT_ROUNDS = 12;

// Hash password before storing
const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

// Verify password
const isValid = await bcrypt.compare(plainPassword, hashedPassword);
```

### 2. HTTPS Enforcement (Production)
```typescript
app.use((req, res, next) => {
  if (process.env.NODE_ENV === 'production' && 
      req.headers['x-forwarded-proto'] !== 'https') {
    return res.redirect(301, 'https://' + req.headers.host + req.url);
  }
  next();
});
```

### 3. Request Size Limits
```typescript
import express from 'express';

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
```

### 4. Error Handling
```typescript
// Global error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  
  // Don't leak internal error details
  res.status(err.status || 500).json({
    message: process.env.NODE_ENV === 'production' 
      ? 'An error occurred' 
      : err.message
  });
});
```

### 5. Logging and Monitoring
```typescript
import morgan from 'morgan';
import winston from 'winston';

// HTTP request logging
app.use(morgan('combined'));

// Application logging
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

// Log security events
logger.warn('Failed login attempt', { email, ip: req.ip });
logger.error('Potential SQL injection attempt', { input: req.body });
```

---

## ✅ Backend Security Checklist

### Critical (Must Implement)
- [ ] Server-side input validation for all user inputs
- [ ] SQL/NoSQL injection prevention (parameterized queries/ORM)
- [ ] Password hashing with bcrypt (salt rounds >= 12)
- [ ] JWT validation on all protected routes
- [ ] Server-side rate limiting on auth and API endpoints
- [ ] HTTPS in production
- [ ] CORS properly configured

### Important (Should Implement)
- [ ] CSRF protection via header validation
- [ ] OAuth state parameter validation
- [ ] Security headers (helmet.js)
- [ ] Error messages don't leak sensitive information
- [ ] Request size limits
- [ ] Token expiration properly set (24h recommended)

### Recommended (Enhanced Security)
- [ ] Logging and monitoring of security events
- [ ] Account lockout after N failed attempts
- [ ] IP-based rate limiting
- [ ] Session management (if using sessions)
- [ ] Two-factor authentication support
- [ ] Regular security audits
- [ ] Automated dependency scanning

---

## 🧪 Testing Your Backend Security

### Manual Tests
```bash
# Test rate limiting
for i in {1..10}; do curl -X POST http://localhost:3000/api/auth/login; done

# Test SQL injection
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@test.com OR 1=1--","password":"test"}'

# Test XSS in inputs
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","username":"<script>alert(1)</script>","password":"password123"}'

# Test invalid UUIDs
curl -X POST http://localhost:3000/api/matches \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"player1Id":"invalid","player2Id":"also-invalid"}'

# Test missing CSRF header
curl -X GET http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Automated Testing
```typescript
// Example Jest test
describe('Authentication Security', () => {
  it('should reject invalid email format', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'invalid-email', username: 'test', password: 'password123' });
    
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('Invalid email');
  });
  
  it('should enforce rate limiting', async () => {
    for (let i = 0; i < 6; i++) {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@test.com', password: 'wrong' });
      
      if (i < 5) {
        expect(res.status).toBe(401);
      } else {
        expect(res.status).toBe(429);
      }
    }
  });
});
```

---

## 📚 Recommended Dependencies

```json
{
  "dependencies": {
    "bcrypt": "^5.1.1",
    "cors": "^2.8.5",
    "express-rate-limit": "^7.1.5",
    "helmet": "^7.1.0",
    "jsonwebtoken": "^9.0.2",
    "morgan": "^1.10.0",
    "winston": "^3.11.0"
  },
  "devDependencies": {
    "@types/bcrypt": "^5.0.2",
    "@types/cors": "^2.8.17",
    "@types/jsonwebtoken": "^9.0.5",
    "@types/morgan": "^1.9.9"
  }
}
```

---

## 🚨 Common Security Mistakes to Avoid

1. ❌ Trusting client-side validation
2. ❌ Storing passwords in plaintext
3. ❌ Using weak JWT secrets
4. ❌ Not validating UUIDs/IDs
5. ❌ Exposing internal error messages
6. ❌ Using `SELECT *` without sanitization
7. ❌ Not implementing rate limiting
8. ❌ Allowing CORS from `*` in production
9. ❌ Not validating token expiration
10. ❌ Logging sensitive data (passwords, tokens)

---

## 📖 Additional Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [Express Security Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)
- [JWT Best Practices](https://tools.ietf.org/html/rfc8725)

---

## 🎯 Summary

**Remember**: Frontend security is about UX and preventing accidents. Backend security is about actually protecting your data and users.

Every validation, every check, every security measure implemented on the frontend **MUST** be duplicated and enforced on the backend.

The frontend security measures provide:
- ✅ Better user experience
- ✅ Reduced unnecessary API calls
- ✅ Client-side error prevention
- ❌ **NOT** actual security (easily bypassed)

**Implement all the measures in this guide to ensure your backend properly enforces the security contract established by the frontend.**
