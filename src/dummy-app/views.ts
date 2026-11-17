import { DummyDatabaseSnapshot, DummyUser } from '../types';

const baseStyles = `
  * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  body { margin: 0; background: #0f172a; color: #e2e8f0; min-height: 100vh; }
  .nav { background: #1e293b; border-bottom: 1px solid #334155; padding: 14px 28px; display: flex; justify-content: space-between; align-items: center; }
  .nav a { color: #38bdf8; text-decoration: none; font-weight: 600; margin-left: 16px; }
  .container { max-width: 960px; margin: 36px auto; padding: 0 20px; }
  .card { background: #1e293b; border: 1px solid #334155; border-radius: 10px; padding: 24px; margin-bottom: 20px; }
  h1, h2 { margin-top: 0; color: #f8fafc; }
  label { display: block; margin-bottom: 6px; font-size: 14px; color: #cbd5e1; }
  input, select { width: 100%; padding: 10px 12px; border-radius: 6px; border: 1px solid #475569; background: #0f172a; color: #f8fafc; margin-bottom: 14px; }
  button, .btn { background: #0284c7; color: #fff; border: none; padding: 10px 18px; border-radius: 6px; cursor: pointer; font-weight: 600; text-decoration: none; display: inline-block; }
  button:hover, .btn:hover { background: #0369a1; }
  .btn-danger { background: #dc2626; }
  .btn-secondary { background: #475569; }
  .alert-error { background: #7f1d1d; border: 1px solid #ef4444; color: #fecaca; padding: 10px 14px; border-radius: 6px; margin-bottom: 16px; }
  .alert-success { background: #14532d; border: 1px solid #22c55e; color: #bbf7d0; padding: 10px 14px; border-radius: 6px; margin-bottom: 16px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 20px; }
  .stat { background: #0f172a; border: 1px solid #334155; border-radius: 8px; padding: 16px; }
  .stat-val { font-size: 28px; font-weight: 700; color: #38bdf8; }
  table { width: 100%; border-collapse: collapse; margin-top: 10px; }
  th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid #334155; font-size: 14px; }
  th { color: #94a3b8; font-weight: 600; }
`;

export function renderLandingPage(loggedInUser?: Omit<DummyUser, 'password'>): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><title>Dummy Target App</title><style>${baseStyles}</style></head>
<body>
  <nav class="nav">
    <strong>QA Dummy Target App</strong>
    <div>
      ${
        loggedInUser
          ? `<a href="/dashboard">Dashboard</a><a href="/logout">Logout</a>`
          : `<a href="/login">Login</a>`
      }
    </div>
  </nav>
  <main class="container">
    <div class="card">
      <h1>SDET Dummy Target Application</h1>
      <p>Built-in OAuth 2.0, REST API, and UI Portal for validating backend API, integration, and Cypress E2E tests.</p>
      ${
        loggedInUser
          ? `<a class="btn" href="/dashboard">Go to Dashboard</a>`
          : `<a class="btn" href="/login">Login</a>`
      }
    </div>
  </main>
</body>
</html>`;
}

export function renderLoginPage(errorMessage?: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><title>Login - Dummy Target App</title><style>${baseStyles}</style></head>
<body>
  <nav class="nav">
    <a href="/" style="margin-left:0">QA Dummy Target App</a>
  </nav>
  <main class="container" style="max-width: 440px;">
    <div class="card">
      <h1>Sign In</h1>
      ${errorMessage ? `<div class="alert-error" role="alert">${errorMessage}</div>` : ''}
      <form method="POST" action="/login">
        <label for="username">Username</label>
        <input id="username" name="username" type="text" placeholder="admin" required />

        <label for="password">Password</label>
        <input id="password" name="password" type="password" placeholder="password" required />

        <button id="login-btn" type="submit">Login</button>
      </form>
      <p style="margin-top: 16px; font-size: 12px; color: #94a3b8;">
        Demo credentials: <code>admin</code> / <code>password</code>
      </p>
    </div>
  </main>
</body>
</html>`;
}

export function renderDashboardPage(
  user: Omit<DummyUser, 'password'>,
  snapshot: DummyDatabaseSnapshot,
  flashMessage?: string
): string {
  const userRows = snapshot.users
    .map(
      (u) => `
      <tr data-testid="user-row-${u.username}">
        <td>${u.id}</td>
        <td>${u.name}</td>
        <td>${u.email}</td>
        <td>${u.role}</td>
      </tr>`
    )
    .join('');

  const productOptions = snapshot.products
    .map((p) => `<option value="${p.id}">${p.name} ($${p.price} - Stock: ${p.stock})</option>`)
    .join('');

  const orderRows = snapshot.orders
    .map(
      (o) => `
      <tr>
        <td>${o.id}</td>
        <td>${o.userId}</td>
        <td>${o.productId}</td>
        <td>${o.quantity}</td>
        <td>$${o.totalAmount.toFixed(2)}</td>
        <td>${o.status}</td>
      </tr>`
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><title>Dashboard - Dummy Target App</title><style>${baseStyles}</style></head>
<body>
  <nav class="nav">
    <strong>QA Dummy Target App</strong>
    <div>
      <span>Signed in as <strong>${user.username}</strong></span>
      <a href="/logout" id="logout-link">Logout</a>
    </div>
  </nav>
  <main class="container">
    <div class="card">
      <h1>Welcome, ${user.name}</h1>
      <p>Role: <strong>${user.role}</strong> | Last data reset: ${snapshot.lastResetAt}</p>
      ${flashMessage ? `<div class="alert-success" data-testid="flash-message">${flashMessage}</div>` : ''}
      <div class="grid">
        <div class="stat"><div>Users</div><div class="stat-val" data-testid="stat-users">${snapshot.users.length}</div></div>
        <div class="stat"><div>Products</div><div class="stat-val" data-testid="stat-products">${snapshot.products.length}</div></div>
        <div class="stat"><div>Orders</div><div class="stat-val" data-testid="stat-orders">${snapshot.orders.length}</div></div>
      </div>
    </div>

    <div class="card">
      <h2>Create User</h2>
      <form method="POST" action="/ui/users" data-testid="create-user-form">
        <label for="new-user-name">Full Name</label>
        <input id="new-user-name" name="name" type="text" placeholder="Jane SDET" required />
        <label for="new-user-email">Email</label>
        <input id="new-user-email" name="email" type="email" placeholder="jane@qa-corp.dev" required />
        <label for="new-user-role">Role</label>
        <select id="new-user-role" name="role">
          <option value="sdet">sdet</option>
          <option value="developer">developer</option>
          <option value="viewer">viewer</option>
          <option value="admin">admin</option>
        </select>
        <button type="submit" id="create-user-btn">Add User</button>
      </form>
      <table>
        <thead><tr><th>ID</th><th>Name</th><th>Email</th><th>Role</th></tr></thead>
        <tbody>${userRows}</tbody>
      </table>
    </div>

    <div class="card">
      <h2>Place Order</h2>
      <form method="POST" action="/ui/orders" data-testid="create-order-form">
        <input type="hidden" name="userId" value="${user.id}" />
        <label for="order-product">Product</label>
        <select id="order-product" name="productId">${productOptions}</select>
        <label for="order-qty">Quantity</label>
        <input id="order-qty" name="quantity" type="number" min="1" value="1" required />
        <button type="submit" id="place-order-btn">Submit Order</button>
      </form>
      <table>
        <thead><tr><th>Order ID</th><th>User</th><th>Product</th><th>Qty</th><th>Total</th><th>Status</th></tr></thead>
        <tbody>${orderRows}</tbody>
      </table>
    </div>
  </main>
</body>
</html>`;
}
