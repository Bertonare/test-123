import { z, ZodSchema } from 'zod';

/**
 * Validates an API response payload against a Zod contract schema.
 * Produces structured field-level error paths for rapid debugging by SDETs and AI agents.
 */
export function assertContract<T>(schema: ZodSchema<T>, payload: unknown, contractName: string): T {
  const result = schema.safeParse(payload);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
      .join('; ');
    throw new Error(`API Contract violation in [${contractName}]: ${issues}`);
  }
  return result.data;
}

export { z };
