import { Response } from 'supertest';
import { ServiceHttpClient } from '../core/httpClient';

export class UsersServiceClient {
  private readonly http: ServiceHttpClient;

  constructor(baseUrl: string) {
    this.http = new ServiceHttpClient(baseUrl);
  }

  listUsers(authHeader?: Record<string, string>): Promise<Response> {
    return this.http.get('/api/users', { headers: authHeader });
  }

  getUser(id: string, authHeader?: Record<string, string>): Promise<Response> {
    return this.http.get(`/api/users/${id}`, { headers: authHeader });
  }

  createUser(
    payload: { name?: string; email?: string; username?: string; role?: string },
    authHeader?: Record<string, string>
  ): Promise<Response> {
    return this.http.post('/api/users', payload, { headers: authHeader });
  }

  deleteUser(id: string, authHeader?: Record<string, string>): Promise<Response> {
    return this.http.delete(`/api/users/${id}`, { headers: authHeader });
  }
}
