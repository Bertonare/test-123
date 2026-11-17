import crypto from 'crypto';
import request, { Response } from 'supertest';
import config from '../config';

export interface RequestOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
  correlationId?: string;
}

/**
 * Standardized Service HTTP Client with automatic Correlation IDs and timeouts.
 */
export class ServiceHttpClient {
  constructor(private readonly baseUrl: string) {}

  private buildHeaders(options?: RequestOptions): Record<string, string> {
    return {
      'X-Correlation-Id': options?.correlationId || `qa-${crypto.randomUUID().slice(0, 8)}`,
      ...(options?.headers || {}),
    };
  }

  get(path: string, options?: RequestOptions): Promise<Response> {
    return request(this.baseUrl)
      .get(path)
      .set(this.buildHeaders(options))
      .timeout(options?.timeoutMs || config.api.timeout);
  }

  post(path: string, body?: string | object, options?: RequestOptions): Promise<Response> {
    return request(this.baseUrl)
      .post(path)
      .set(this.buildHeaders(options))
      .send(body)
      .timeout(options?.timeoutMs || config.api.timeout);
  }

  delete(path: string, options?: RequestOptions): Promise<Response> {
    return request(this.baseUrl)
      .delete(path)
      .set(this.buildHeaders(options))
      .timeout(options?.timeoutMs || config.api.timeout);
  }
}
