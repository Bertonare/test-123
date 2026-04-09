import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleDirectories: ['node_modules', 'src'],
  testMatch: ['**/__tests__/**/*.ts?(x)', '**/?(*.)+(spec|test).ts?(x)'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  setupFiles: ['dotenv/config'],
  verbose: true,
  // Report results in JUnit format for Jenkins integration
  reporters: [
    'default',
    [
      'jest-junit',
      {
        outputDirectory: 'reports/junit',
        outputName: 'jest-junit.xml',
      },
    ],
  ],
  // Coverage reporting
  collectCoverage: true,
  coverageDirectory: 'reports/coverage',
  coverageReporters: ['text', 'lcov', 'cobertura'],
};

export default config;
