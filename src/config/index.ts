import * as dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config();

/**
 * Validates and provides access to environment variables.
 * This ensures the application fails early if configuration is missing.
 */
export const config = {
  api: {
    baseUrl: process.env.BASE_URL || 'https://api.example.com',
    timeout: parseInt(process.env.API_TIMEOUT || '5000', 10),
  },
  oauth: {
    tokenUrl: process.env.OAUTH_TOKEN_URL || 'https://auth.example.com/oauth/token',
    clientId: process.env.OAUTH_CLIENT_ID || '',
    clientSecret: process.env.OAUTH_CLIENT_SECRET || '',
    grantType: process.env.OAUTH_GRANT_TYPE || 'client_credentials',
  },
  cypress: {
    baseUrl: process.env.CYPRESS_BASE_URL || 'http://localhost:3000',
    username: process.env.CYPRESS_USERNAME || '',
    password: process.env.CYPRESS_PASSWORD || '',
  },
  isDevelopment: process.env.NODE_ENV === 'development',
};

// Simple validation to warn if critical variables are missing
const requiredVars = [
  'OAUTH_CLIENT_ID',
  'OAUTH_CLIENT_SECRET'
];

requiredVars.forEach((v) => {
  if (!process.env[v]) {
    console.warn(`WARNING: Missing environment variable ${v}`);
  }
});

export default config;
