import { z } from 'zod';

export const readyResponseSchema = z
  .object({
    status: z.literal('ready'),
  })
  .strict();

export const notReadyResponseSchema = z
  .object({
    status: z.literal('not_ready'),
  })
  .strict();

export const readinessResponseSchema = z.discriminatedUnion('status', [
  readyResponseSchema,
  notReadyResponseSchema,
]);

export type ReadyResponse = z.infer<typeof readyResponseSchema>;
export type NotReadyResponse = z.infer<typeof notReadyResponseSchema>;
export type ReadinessResponse = z.infer<typeof readinessResponseSchema>;
