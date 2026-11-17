import axios from 'axios';
import config from '../config';

/**
 * Utility for OAuth 2.0 authentication with token caching.
 */
export class OAuthUtils {
  private static accessToken: string | null = null;
  private static tokenExpiry: number | null = null;

  /**
   * Clears the cached token (useful when testing fresh auth or switching targets).
   */
  static clearCache(): void {
    this.accessToken = null;
    this.tokenExpiry = null;
  }

  /**
   * Fetches an access token using the configured OAuth 2.0 flow.
   * Implements in-memory caching based on expires_in with a 30s safety buffer.
   */
  static async getAccessToken(options?: {
    tokenUrl?: string;
    clientId?: string;
    clientSecret?: string;
    grantType?: string;
    forceRefresh?: boolean;
  }): Promise<string> {
    const now = Date.now();

    if (
      !options?.forceRefresh &&
      this.accessToken &&
      this.tokenExpiry &&
      now < this.tokenExpiry - 30000
    ) {
      return this.accessToken;
    }

    const tokenUrl = options?.tokenUrl || config.oauth.tokenUrl;
    const clientId = options?.clientId || config.oauth.clientId;
    const clientSecret = options?.clientSecret || config.oauth.clientSecret;
    const grantType = options?.grantType || config.oauth.grantType;

    try {
      const response = await axios.post(
        tokenUrl,
        new URLSearchParams({
          grant_type: grantType,
          client_id: clientId,
          client_secret: clientSecret,
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          timeout: config.api.timeout,
        }
      );

      const { access_token, expires_in } = response.data as {
        access_token: string;
        expires_in?: number;
      };

      this.accessToken = access_token;
      this.tokenExpiry = now + (expires_in || 3600) * 1000;

      return access_token;
    } catch (error: unknown) {
      const err = error as { response?: { data?: unknown }; message?: string };
      console.error('Failed to fetch OAuth token:', err.response?.data || err.message);
      throw new Error('Authentication failed');
    }
  }

  /**
   * Helper to get Bearer authorization headers.
   */
  static async getAuthHeader(forceRefresh = false): Promise<{ Authorization: string }> {
    const token = await this.getAccessToken({ forceRefresh });
    return { Authorization: `Bearer ${token}` };
  }
}

export default OAuthUtils;
