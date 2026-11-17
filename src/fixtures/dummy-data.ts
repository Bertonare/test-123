import {
  DummyDatabaseSnapshot,
  DummyOrder,
  DummyProduct,
  DummyUser,
  OAuthClient,
} from '../types';

const INITIAL_OAUTH_CLIENTS: OAuthClient[] = [
  {
    clientId: 'demo-client-id',
    clientSecret: 'demo-client-secret',
    name: 'SDET Framework Default Client',
    scopes: ['read:users', 'write:users', 'read:products', 'write:orders'],
  },
  {
    clientId: 'ci-runner-id',
    clientSecret: 'ci-runner-secret',
    name: 'Jenkins CI Runner Client',
    scopes: ['read:users', 'write:users', 'read:products', 'write:orders', 'admin:reset'],
  },
];

const INITIAL_USERS: DummyUser[] = [
  {
    id: 'usr-101',
    username: 'admin',
    password: 'password',
    name: 'Alice Mercer',
    email: 'alice.mercer@qa-corp.dev',
    role: 'admin',
    active: true,
    createdAt: '2026-01-15T09:00:00.000Z',
  },
  {
    id: 'usr-102',
    username: 'sdet_lead',
    password: 'sdet_password',
    name: 'Berton Pratama',
    email: 'berton@qa-corp.dev',
    role: 'sdet',
    active: true,
    createdAt: '2026-02-01T10:30:00.000Z',
  },
  {
    id: 'usr-103',
    username: 'qa_engineer',
    password: 'qa_password',
    name: 'Clara Chen',
    email: 'clara.chen@qa-corp.dev',
    role: 'sdet',
    active: true,
    createdAt: '2026-02-18T14:15:00.000Z',
  },
  {
    id: 'usr-104',
    username: 'dev_user',
    password: 'dev_password',
    name: 'Diego Morales',
    email: 'diego.morales@qa-corp.dev',
    role: 'developer',
    active: true,
    createdAt: '2026-03-04T08:45:00.000Z',
  },
];

const INITIAL_PRODUCTS: DummyProduct[] = [
  {
    id: 'prd-201',
    sku: 'QA-GRID-01',
    name: 'Browser Grid Node',
    category: 'Infrastructure',
    price: 149.0,
    stock: 25,
  },
  {
    id: 'prd-202',
    sku: 'QA-LOAD-02',
    name: 'Load Runner License',
    category: 'Performance',
    price: 499.0,
    stock: 12,
  },
  {
    id: 'prd-203',
    sku: 'QA-DATA-03',
    name: 'Test Data Synthesizer',
    category: 'Automation',
    price: 89.0,
    stock: 40,
  },
  {
    id: 'prd-204',
    sku: 'QA-SEC-04',
    name: 'OAuth Security Scanner',
    category: 'Security',
    price: 299.0,
    stock: 5,
  },
];

const INITIAL_ORDERS: DummyOrder[] = [
  {
    id: 'ord-301',
    userId: 'usr-101',
    productId: 'prd-201',
    quantity: 2,
    totalAmount: 298.0,
    status: 'confirmed',
    createdAt: '2026-04-01T11:20:00.000Z',
  },
  {
    id: 'ord-302',
    userId: 'usr-102',
    productId: 'prd-203',
    quantity: 1,
    totalAmount: 89.0,
    status: 'confirmed',
    createdAt: '2026-04-05T16:40:00.000Z',
  },
];

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

/**
 * In-memory Dummy Data Store used by the built-in Dummy Target App,
 * API/Integration tests, Cypress E2E tests, and the Test Management Dashboard.
 */
export class DummyDataStore {
  private users: DummyUser[] = clone(INITIAL_USERS);
  private products: DummyProduct[] = clone(INITIAL_PRODUCTS);
  private orders: DummyOrder[] = clone(INITIAL_ORDERS);
  private oauthClients: OAuthClient[] = clone(INITIAL_OAUTH_CLIENTS);
  private lastResetAt: string = new Date().toISOString();

  reset(): DummyDatabaseSnapshot {
    this.users = clone(INITIAL_USERS);
    this.products = clone(INITIAL_PRODUCTS);
    this.orders = clone(INITIAL_ORDERS);
    this.oauthClients = clone(INITIAL_OAUTH_CLIENTS);
    this.lastResetAt = new Date().toISOString();
    return this.getSnapshot();
  }

  getSnapshot(): DummyDatabaseSnapshot {
    return {
      users: this.users.map(({ password: _pw, ...safeUser }) => safeUser),
      products: clone(this.products),
      orders: clone(this.orders),
      oauthClients: this.oauthClients.map(({ clientId, name, scopes }) => ({
        clientId,
        name,
        scopes,
      })),
      lastResetAt: this.lastResetAt,
    };
  }

  validateOAuthClient(clientId: string, clientSecret: string): OAuthClient | undefined {
    return this.oauthClients.find(
      (c) => c.clientId === clientId && c.clientSecret === clientSecret
    );
  }

  validateUserCredentials(username: string, password: string): DummyUser | undefined {
    return this.users.find(
      (u) => u.username === username && u.password === password && u.active
    );
  }

  listUsers(): Omit<DummyUser, 'password'>[] {
    return this.users.map(({ password: _pw, ...safe }) => safe);
  }

  getUserById(id: string): Omit<DummyUser, 'password'> | undefined {
    const user = this.users.find((u) => u.id === id);
    if (!user) return undefined;
    const { password: _pw, ...safe } = user;
    return safe;
  }

  createUser(input: {
    name: string;
    email: string;
    username?: string;
    password?: string;
    role?: DummyUser['role'];
  }): Omit<DummyUser, 'password'> {
    const id = `usr-${Date.now().toString().slice(-6)}`;
    const newUser: DummyUser = {
      id,
      username: input.username || input.email.split('@')[0],
      password: input.password || 'temp_password',
      name: input.name,
      email: input.email,
      role: input.role || 'viewer',
      active: true,
      createdAt: new Date().toISOString(),
    };
    this.users.push(newUser);
    const { password: _pw, ...safe } = newUser;
    return safe;
  }

  deleteUser(id: string): boolean {
    const idx = this.users.findIndex((u) => u.id === id);
    if (idx === -1) return false;
    this.users.splice(idx, 1);
    return true;
  }

  listProducts(): DummyProduct[] {
    return clone(this.products);
  }

  getProductById(id: string): DummyProduct | undefined {
    return this.products.find((p) => p.id === id);
  }

  listOrders(): DummyOrder[] {
    return clone(this.orders);
  }

  createOrder(input: {
    userId: string;
    productId: string;
    quantity: number;
  }): { order?: DummyOrder; error?: string; statusCode?: number } {
    const user = this.users.find((u) => u.id === input.userId);
    if (!user) {
      return { error: `User ${input.userId} not found`, statusCode: 404 };
    }

    const product = this.products.find((p) => p.id === input.productId);
    if (!product) {
      return { error: `Product ${input.productId} not found`, statusCode: 404 };
    }

    if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
      return { error: 'Quantity must be a positive integer', statusCode: 400 };
    }

    if (product.stock < input.quantity) {
      return {
        error: `Insufficient stock for ${product.name}. Available: ${product.stock}`,
        statusCode: 409,
      };
    }

    product.stock -= input.quantity;
    const order: DummyOrder = {
      id: `ord-${Date.now().toString().slice(-6)}`,
      userId: user.id,
      productId: product.id,
      quantity: input.quantity,
      totalAmount: Number((product.price * input.quantity).toFixed(2)),
      status: 'confirmed',
      createdAt: new Date().toISOString(),
    };
    this.orders.push(order);
    return { order };
  }

  seedAdditionalDummyUsers(count = 3): Omit<DummyUser, 'password'>[] {
    const created: Omit<DummyUser, 'password'>[] = [];
    for (let i = 1; i <= count; i++) {
      const suffix = Math.floor(Math.random() * 9000) + 1000;
      created.push(
        this.createUser({
          name: `QA Synthetic User ${suffix}`,
          email: `qa.synthetic.${suffix}@qa-corp.dev`,
          username: `synthetic_${suffix}`,
          role: i % 2 === 0 ? 'sdet' : 'viewer',
        })
      );
    }
    return created;
  }
}

export const dummyDataStore = new DummyDataStore();
