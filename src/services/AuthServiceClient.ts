import request, { Response } from 'supertest';
import config from '../config';

export class AuthServiceClient {
  constructor(private readonly baseUrl: string) {}

  requestToken(params: {
    grantType?: string;
    clientId?: string;
    clientSecret?: string;
    username?: string;
    password?: string;
  }): Promise<Response> {
    const body: Record<string, string> = {
      grant_type: params.grantType || config.oauth.grantType,
    };
    if (params.clientId !== undefined) body.client_id = params.clientId;
    if (params.clientSecret !== undefined) body.client_secret = params.clientSecret;
    if (params.username !== undefined) body.username = params.username;
    if (params.password !== undefined) body.password = params.password;

    return request(this.baseUrl)
      .post('/oauth/token')
      .type('form')
      .send(body)
      .timeout(config.api.timeout);
  }
}
