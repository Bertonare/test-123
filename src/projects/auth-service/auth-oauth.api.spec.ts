import config from '../../config';
import { ApiErrorContract, OAuthTokenContract } from '../../contracts/apiContracts';
import { assertContract } from '../../core/contractValidator';
import { AuthServiceClient } from '../../services/AuthServiceClient';
import { OAuthUtils } from '../../utils/oauth';
import { setupTestTarget, TestTargetHandle } from '../../utils/test-target';

describe('[auth-service] OAuth 2.0 Authentication & Contract Tests @smoke @oauth', () => {
  let target: TestTargetHandle;
  let authClient: AuthServiceClient;

  beforeAll(async () => {
    target = await setupTestTarget('auth-service');
    authClient = new AuthServiceClient(target.baseUrl);
    OAuthUtils.clearCache();
  });

  afterAll(async () => {
    OAuthUtils.clearCache();
    await target.close();
  });

  it('[positive] should issue a valid Bearer token matching OAuthTokenContract via client_credentials', async () => {
    const res = await authClient.requestToken({
      grantType: 'client_credentials',
      clientId: config.oauth.clientId,
      clientSecret: config.oauth.clientSecret,
    });

    expect(res.status).toBe(200);
    const body = assertContract(OAuthTokenContract, res.body, 'OAuthTokenContract');
    expect(body.access_token).toMatch(/^dummy_tok_|.+/);
  });

  it('[positive] should issue a Bearer token via password grant for valid user credentials', async () => {
    const res = await authClient.requestToken({
      grantType: 'password',
      username: config.cypress.username,
      password: config.cypress.password,
    });

    expect(res.status).toBe(200);
    assertContract(OAuthTokenContract, res.body, 'OAuthPasswordGrantContract');
  });

  it('[positive] should cache and reuse a valid OAuth access token via OAuthUtils', async () => {
    const first = await OAuthUtils.getAccessToken({ tokenUrl: target.tokenUrl });
    const second = await OAuthUtils.getAccessToken({ tokenUrl: target.tokenUrl });

    expect(first).toBeTruthy();
    expect(second).toBe(first);
  });

  it('[negative] should reject invalid client credentials with 401 and error contract', async () => {
    const res = await authClient.requestToken({
      grantType: 'client_credentials',
      clientId: 'invalid-client',
      clientSecret: 'invalid-secret',
    });

    expect(res.status).toBe(401);
    const err = assertContract(ApiErrorContract, res.body, 'ApiErrorContract');
    expect(err.error).toBe('invalid_client');
  });

  it('[edge] should reject unsupported grant_type with 400 error contract', async () => {
    const res = await authClient.requestToken({
      grantType: 'implicit',
      clientId: config.oauth.clientId,
      clientSecret: config.oauth.clientSecret,
    });

    expect(res.status).toBe(400);
    const err = assertContract(ApiErrorContract, res.body, 'ApiErrorContract');
    expect(err.error).toBe('unsupported_grant_type');
  });

  it('[edge] should rotate token when forceRefresh is requested', async () => {
    const first = await OAuthUtils.getAccessToken({ tokenUrl: target.tokenUrl });
    const refreshed = await OAuthUtils.getAccessToken({
      tokenUrl: target.tokenUrl,
      forceRefresh: true,
    });

    expect(refreshed).toBeTruthy();
    expect(refreshed).not.toBe(first);
  });
});
