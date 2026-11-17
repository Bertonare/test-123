import config from '../../config';
import { ApiErrorContract, UserContract, UsersListContract } from '../../contracts/apiContracts';
import { assertContract } from '../../core/contractValidator';
import { UsersServiceClient } from '../../services/UsersServiceClient';
import { OAuthUtils } from '../../utils/oauth';
import { setupTestTarget, TestTargetHandle } from '../../utils/test-target';

describe('[users-service] Users API & Contract Tests @smoke @api @contract', () => {
  let target: TestTargetHandle;
  let usersClient: UsersServiceClient;
  let authHeader: { Authorization: string };

  beforeAll(async () => {
    target = await setupTestTarget('users-service');
    usersClient = new UsersServiceClient(target.baseUrl);
    OAuthUtils.clearCache();

    const token = await OAuthUtils.getAccessToken({
      tokenUrl: target.tokenUrl,
      clientId: config.oauth.clientId,
      clientSecret: config.oauth.clientSecret,
    });
    authHeader = { Authorization: `Bearer ${token}` };
  });

  afterAll(async () => {
    OAuthUtils.clearCache();
    await target.close();
  });

  it('[positive] should return users matching UsersListContract when authenticated', async () => {
    const res = await usersClient.listUsers(authHeader);

    expect(res.status).toBe(200);
    const body = assertContract(UsersListContract, res.body, 'UsersListContract');
    expect(body.total).toBeGreaterThanOrEqual(1);
  });

  it('[positive] should create and delete a user while satisfying UserContract', async () => {
    const createRes = await usersClient.createUser(
      {
        name: 'Microservice QA User',
        email: `ms.qa.${Date.now()}@qa-corp.dev`,
        role: 'sdet',
      },
      authHeader
    );

    expect(createRes.status).toBe(201);
    const created = assertContract(UserContract, createRes.body, 'UserContract');

    const getRes = await usersClient.getUser(created.id, authHeader);
    expect(getRes.status).toBe(200);
    expect(getRes.body.id).toBe(created.id);

    const delRes = await usersClient.deleteUser(created.id, authHeader);
    expect(delRes.status).toBe(200);
    expect(delRes.body.deleted).toBe(true);
  });

  it('[negative] should reject unauthenticated requests with 401 and ApiErrorContract', async () => {
    const res = await usersClient.listUsers();

    expect(res.status).toBe(401);
    const err = assertContract(ApiErrorContract, res.body, 'ApiErrorContract');
    expect(err.error).toBe('unauthorized');
  });

  it('[negative] should return 400 validation_error when required fields are missing', async () => {
    const res = await usersClient.createUser({ name: 'Missing Email' }, authHeader);

    expect(res.status).toBe(400);
    const err = assertContract(ApiErrorContract, res.body, 'ApiErrorContract');
    expect(err.error).toBe('validation_error');
  });

  it('[edge] should return 404 when fetching or deleting a non-existent user ID', async () => {
    const getRes = await usersClient.getUser('usr-does-not-exist', authHeader);
    expect(getRes.status).toBe(404);
    assertContract(ApiErrorContract, getRes.body, 'UserNotFoundError');

    const delRes = await usersClient.deleteUser('usr-does-not-exist', authHeader);
    expect(delRes.status).toBe(404);
  });

  it('[edge] should reject malformed Bearer token with 401 invalid_token', async () => {
    const res = await usersClient.listUsers({ Authorization: 'Bearer malformed_token_xyz' });

    expect(res.status).toBe(401);
    const err = assertContract(ApiErrorContract, res.body, 'MalformedTokenError');
    expect(err.error).toBe('invalid_token');
  });
});
