import axios from 'axios';
import config from '../config';

/**
 * Utility for OAuth 2.0 authentication.
 */
export class OAuthUtils {
  private static accessToken: string | null = null;
  private static tokenExpiry: number | null = null;

  /**
   * Fetches an access token using the Client Credentials flow.
   * Implements simple caching based on expiry.
   */
  static async getAccessToken(): Promise<string> {
    const now = Date.now();

    // Return cached token if still valid (with 30s buffer)
    if (this.accessToken && this.tokenExpiry && now < this.tokenExpiry - 30000) {
      return this.accessToken;
    }

    try {
      const response = await axios.post(
        config.oauth.tokenUrl,
        new URLSearchParams({
          grant_type: config.oauth.grantType,
          client_id: config.oauth.clientId,
          client_secret: config.oauth.clientSecret,
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      const { access_token, expires_in } = response.data;
      
      this.accessToken = access_token;
      this.tokenExpiry = now + expires_in * 1000;

      return access_token;
    } catch (error: any) {
      console.error('Failed to fetch OAuth token:', error.response?.data || error.message);
      throw new Error('Authentication failed');
    }
  }

  /**
   * Helper to get authorization headers.
   */
  static async getAuthHeader(): Promise<{ Authorization: string }> {
    const token = await this.getAccessToken();
    return { Authorization: `Bearer ${token}` };
  }
}

export default OAuthUtils;
