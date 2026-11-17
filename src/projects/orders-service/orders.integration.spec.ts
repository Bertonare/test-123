import config from '../../config';
import {
  ApiErrorContract,
  OrderContract,
  ProductsListContract,
} from '../../contracts/apiContracts';
import { assertContract } from '../../core/contractValidator';
import { OrdersServiceClient } from '../../services/OrdersServiceClient';
import { UsersServiceClient } from '../../services/UsersServiceClient';
import { OAuthUtils } from '../../utils/oauth';
import { setupTestTarget, TestTargetHandle } from '../../utils/test-target';

describe('[orders-service] Cross-Service Order & Inventory Integration @integration @regression', () => {
  let target: TestTargetHandle;
  let usersClient: UsersServiceClient;
  let ordersClient: OrdersServiceClient;
  let authHeader: { Authorization: string };

  beforeAll(async () => {
    target = await setupTestTarget('orders-service');
    usersClient = new UsersServiceClient(target.baseUrl);
    ordersClient = new OrdersServiceClient(target.baseUrl);
    OAuthUtils.clearCache();

    const token = await OAuthUtils.getAccessToken({
      tokenUrl: target.tokenUrl,
      clientId: config.oauth.clientId,
      clientSecret: config.oauth.clientSecret,
    });
    authHeader = { Authorization: `Bearer ${token}` };
  });

  beforeEach(async () => {
    await ordersClient.resetDummyData();
  });

  afterAll(async () => {
    OAuthUtils.clearCache();
    await target.close();
  });

  it('[positive] should create a user, place an order, satisfy OrderContract, and decrement product stock', async () => {
    const userRes = await usersClient.createUser(
      {
        name: 'Integration Buyer',
        email: `buyer.${Date.now()}@qa-corp.dev`,
        role: 'developer',
      },
      authHeader
    );
    expect(userRes.status).toBe(201);

    const productsRes = await ordersClient.listProducts(authHeader);
    expect(productsRes.status).toBe(200);
    const catalog = assertContract(ProductsListContract, productsRes.body, 'ProductsListContract');
    const targetProduct = catalog.products[0];
    const initialStock = targetProduct.stock;

    const orderRes = await ordersClient.createOrder(
      {
        userId: userRes.body.id,
        productId: targetProduct.id,
        quantity: 2,
      },
      authHeader
    );

    expect(orderRes.status).toBe(201);
    const order = assertContract(OrderContract, orderRes.body, 'OrderContract');
    expect(order.status).toBe('confirmed');
    expect(order.totalAmount).toBeCloseTo(targetProduct.price * 2, 2);

    const updatedProductsRes = await ordersClient.listProducts(authHeader);
    const updatedProduct = updatedProductsRes.body.products.find(
      (p: { id: string }) => p.id === targetProduct.id
    );
    expect(updatedProduct.stock).toBe(initialStock - 2);
  });

  it('[positive] should restore seeded dummy data after calling reset', async () => {
    await usersClient.createUser(
      { name: 'Temporary User', email: 'temp@qa-corp.dev' },
      authHeader
    );

    const resetRes = await ordersClient.resetDummyData();
    expect(resetRes.status).toBe(200);

    const usersRes = await usersClient.listUsers(authHeader);
    expect(usersRes.body.users.some((u: { email: string }) => u.email === 'temp@qa-corp.dev')).toBe(
      false
    );
  });

  it('[negative] should reject an order with 409 when requested quantity exceeds available stock', async () => {
    const productsRes = await ordersClient.listProducts(authHeader);
    const limitedProduct = productsRes.body.products.find(
      (p: { id: string }) => p.id === 'prd-204'
    );

    const orderRes = await ordersClient.createOrder(
      {
        userId: 'usr-101',
        productId: limitedProduct.id,
        quantity: limitedProduct.stock + 50,
      },
      authHeader
    );

    expect(orderRes.status).toBe(409);
    const err = assertContract(ApiErrorContract, orderRes.body, 'ApiErrorContract');
    expect(err.error).toBe('order_error');
  });

  it('[edge] should reject zero or negative order quantity with 400', async () => {
    const orderRes = await ordersClient.createOrder(
      {
        userId: 'usr-101',
        productId: 'prd-201',
        quantity: 0,
      },
      authHeader
    );

    expect(orderRes.status).toBe(400);
    assertContract(ApiErrorContract, orderRes.body, 'ZeroQuantityError');
  });

  it('[edge] should allow ordering exact remaining stock boundary leaving 0 stock', async () => {
    const productsRes = await ordersClient.listProducts(authHeader);
    const limitedProduct = productsRes.body.products.find(
      (p: { id: string }) => p.id === 'prd-204'
    );

    const orderRes = await ordersClient.createOrder(
      {
        userId: 'usr-101',
        productId: limitedProduct.id,
        quantity: limitedProduct.stock,
      },
      authHeader
    );

    expect(orderRes.status).toBe(201);
    assertContract(OrderContract, orderRes.body, 'BoundaryOrderContract');

    const afterRes = await ordersClient.listProducts(authHeader);
    const afterProduct = afterRes.body.products.find((p: { id: string }) => p.id === 'prd-204');
    expect(afterProduct.stock).toBe(0);
  });
});
