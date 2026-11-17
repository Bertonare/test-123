import { Response } from 'supertest';
import { ServiceHttpClient } from '../core/httpClient';

export class OrdersServiceClient {
  private readonly http: ServiceHttpClient;

  constructor(baseUrl: string) {
    this.http = new ServiceHttpClient(baseUrl);
  }

  listProducts(authHeader?: Record<string, string>): Promise<Response> {
    return this.http.get('/api/products', { headers: authHeader });
  }

  listOrders(authHeader?: Record<string, string>): Promise<Response> {
    return this.http.get('/api/orders', { headers: authHeader });
  }

  createOrder(
    payload: { userId: string; productId: string; quantity: number },
    authHeader?: Record<string, string>
  ): Promise<Response> {
    return this.http.post('/api/orders', payload, { headers: authHeader });
  }

  resetDummyData(): Promise<Response> {
    return this.http.post('/api/test-utils/reset');
  }
}
