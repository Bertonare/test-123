import crypto from 'crypto';
import express, { Express, NextFunction, Request, Response } from 'express';
import { dummyDataStore, DummyDataStore } from '../fixtures/dummy-data';
import { DummyUser } from '../types';
import { renderDashboardPage, renderLandingPage, renderLoginPage } from './views';

interface IssuedToken {
  token: string;
  subject: string;
  scopes: string[];
  expiresAt: number;
}

/**
 * Creates a self-contained Express Dummy Target Application with:
 * - OAuth 2.0 Token Endpoint (/oauth/token)
 * - Protected REST APIs (/api/users, /api/products, /api/orders)
 * - Test Utilities (/api/test-utils/reset, /api/test-utils/snapshot)
 * - Web UI (/login, /dashboard) for Cypress E2E tests
 */
export function createDummyApp(store: DummyDataStore = dummyDataStore): Express {
  const app = express();
  const issuedTokens = new Map<string, IssuedToken>();
  const uiSessions = new Map<string, Omit<DummyUser, 'password'>>();

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  const issueToken = (subject: string, scopes: string[], expiresInSec = 3600): IssuedToken => {
    const token = `dummy_tok_${crypto.randomBytes(16).toString('hex')}`;
    const record: IssuedToken = {
      token,
      subject,
      scopes,
      expiresAt: Date.now() + expiresInSec * 1000,
    };
    issuedTokens.set(token, record);
    return record;
  };

  const requireBearerAuth = (req: Request, res: Response, next: NextFunction): void => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'unauthorized', message: 'Missing Bearer token' });
      return;
    }

    const token = authHeader.slice('Bearer '.length).trim();
    const record = issuedTokens.get(token);
    if (!record || record.expiresAt < Date.now()) {
      res.status(401).json({ error: 'invalid_token', message: 'Token is invalid or expired' });
      return;
    }

    next();
  };

  const getSessionUser = (req: Request): Omit<DummyUser, 'password'> | undefined => {
    const cookieHeader = req.headers.cookie || '';
    const match = cookieHeader.match(/dummy_session=([^;]+)/);
    if (!match) return undefined;
    return uiSessions.get(match[1]);
  };

  // --- Health & Test Utilities ---
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'dummy-target-app',
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/api/test-utils/snapshot', (_req, res) => {
    res.json(store.getSnapshot());
  });

  app.post('/api/test-utils/reset', (_req, res) => {
    const snapshot = store.reset();
    res.json({ message: 'Dummy data reset to initial seed state', snapshot });
  });

  app.post('/api/test-utils/seed', (req, res) => {
    const count = Number(req.body?.count) || 3;
    const created = store.seedAdditionalDummyUsers(count);
    res.status(201).json({ created, snapshot: store.getSnapshot() });
  });

  // --- OAuth 2.0 Token Endpoint ---
  app.post('/oauth/token', (req, res) => {
    const { grant_type, client_id, client_secret, username, password } = req.body || {};

    if (grant_type === 'client_credentials') {
      const client = store.validateOAuthClient(client_id, client_secret);
      if (!client) {
        res.status(401).json({
          error: 'invalid_client',
          error_description: 'Invalid client_id or client_secret',
        });
        return;
      }

      const issued = issueToken(client.clientId, client.scopes);
      res.json({
        access_token: issued.token,
        token_type: 'Bearer',
        expires_in: 3600,
        scope: issued.scopes.join(' '),
      });
      return;
    }

    if (grant_type === 'password') {
      const user = store.validateUserCredentials(username, password);
      if (!user) {
        res.status(401).json({
          error: 'invalid_grant',
          error_description: 'Invalid username or password',
        });
        return;
      }

      const issued = issueToken(user.username, ['read:users', 'write:orders']);
      res.json({
        access_token: issued.token,
        token_type: 'Bearer',
        expires_in: 3600,
        scope: issued.scopes.join(' '),
      });
      return;
    }

    res.status(400).json({
      error: 'unsupported_grant_type',
      error_description: 'Supported grants: client_credentials, password',
    });
  });

  // --- Protected REST APIs (mounted at /api/* and /users alias) ---
  const listUsersHandler = (_req: Request, res: Response) => {
    const users = store.listUsers();
    res.json({ users, total: users.length });
  };

  const getUserHandler = (req: Request, res: Response) => {
    const user = store.getUserById(req.params.id);
    if (!user) {
      res.status(404).json({ error: 'not_found', message: 'User not found' });
      return;
    }
    res.json(user);
  };

  const createUserHandler = (req: Request, res: Response) => {
    const { name, email, username, role } = req.body || {};
    if (!name || !email) {
      res.status(400).json({ error: 'validation_error', message: 'name and email are required' });
      return;
    }
    const created = store.createUser({ name, email, username, role });
    res.status(201).json(created);
  };

  const deleteUserHandler = (req: Request, res: Response) => {
    const deleted = store.deleteUser(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: 'not_found', message: 'User not found' });
      return;
    }
    res.json({ deleted: true, id: req.params.id });
  };

  app.get('/api/users', requireBearerAuth, listUsersHandler);
  app.get('/api/users/:id', requireBearerAuth, getUserHandler);
  app.post('/api/users', requireBearerAuth, createUserHandler);
  app.delete('/api/users/:id', requireBearerAuth, deleteUserHandler);

  // Backwards-compatible aliases
  app.get('/users', requireBearerAuth, listUsersHandler);
  app.post('/users', requireBearerAuth, createUserHandler);

  app.get('/api/products', requireBearerAuth, (_req, res) => {
    const products = store.listProducts();
    res.json({ products, total: products.length });
  });

  app.get('/api/orders', requireBearerAuth, (_req, res) => {
    const orders = store.listOrders();
    res.json({ orders, total: orders.length });
  });

  app.post('/api/orders', requireBearerAuth, (req, res) => {
    const { userId, productId, quantity } = req.body || {};
    const result = store.createOrder({
      userId,
      productId,
      quantity: Number(quantity),
    });

    if (result.error) {
      res.status(result.statusCode || 400).json({ error: 'order_error', message: result.error });
      return;
    }

    res.status(201).json(result.order);
  });

  // --- Frontend Web Pages (for Cypress E2E) ---
  app.get('/', (req, res) => {
    const user = getSessionUser(req);
    res.send(renderLandingPage(user));
  });

  app.get('/login', (_req, res) => {
    res.send(renderLoginPage());
  });

  app.post('/login', (req, res) => {
    const { username, password } = req.body || {};
    const user = store.validateUserCredentials(username, password);
    if (!user) {
      res.status(401).send(renderLoginPage('Invalid credentials'));
      return;
    }

    const { password: _pw, ...safeUser } = user;
    const sessionId = crypto.randomBytes(16).toString('hex');
    uiSessions.set(sessionId, safeUser);
    res.setHeader('Set-Cookie', `dummy_session=${sessionId}; Path=/; HttpOnly`);
    res.redirect('/dashboard');
  });

  app.get('/logout', (req, res) => {
    const cookieHeader = req.headers.cookie || '';
    const match = cookieHeader.match(/dummy_session=([^;]+)/);
    if (match) uiSessions.delete(match[1]);
    res.setHeader('Set-Cookie', 'dummy_session=; Path=/; Max-Age=0');
    res.redirect('/login');
  });

  app.get('/dashboard', (req, res) => {
    const user = getSessionUser(req);
    if (!user) {
      res.redirect('/login');
      return;
    }
    const flash = typeof req.query.msg === 'string' ? req.query.msg : undefined;
    res.send(renderDashboardPage(user, store.getSnapshot(), flash));
  });

  app.post('/ui/users', (req, res) => {
    const user = getSessionUser(req);
    if (!user) {
      res.redirect('/login');
      return;
    }
    const { name, email, role } = req.body || {};
    if (name && email) {
      store.createUser({ name, email, role });
    }
    res.redirect('/dashboard?msg=User+created+successfully');
  });

  app.post('/ui/orders', (req, res) => {
    const user = getSessionUser(req);
    if (!user) {
      res.redirect('/login');
      return;
    }
    const { userId, productId, quantity } = req.body || {};
    const result = store.createOrder({
      userId: userId || user.id,
      productId,
      quantity: Number(quantity) || 1,
    });
    const msg = result.error ? encodeURIComponent(result.error) : 'Order+placed+successfully';
    res.redirect(`/dashboard?msg=${msg}`);
  });

  return app;
}
