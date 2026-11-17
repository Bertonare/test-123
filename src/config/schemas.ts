import { z } from 'zod';

export const EnvironmentProfileSchema = z.object({
  name: z.string().min(1),
  label: z.string().min(1),
  useDummyApp: z.boolean(),
  timeoutMs: z.number().int().positive(),
  oauth: z.object({
    tokenUrl: z.string().url(),
    grantType: z.enum(['client_credentials', 'password']),
  }),
  services: z.record(z.string(), z.string().url()),
});

export const ProjectDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(['microservice', 'frontend', 'platform']),
  owner: z.string().min(1),
  description: z.string().min(1),
  defaultLayer: z.enum(['backend-api', 'backend-integration', 'frontend-e2e']),
  jenkinsJob: z.string().min(1),
  testRoot: z.string().min(1),
  tags: z.array(z.string()),
});

export const ProjectsRegistrySchema = z.object({
  projects: z.array(ProjectDefinitionSchema).min(1),
});
