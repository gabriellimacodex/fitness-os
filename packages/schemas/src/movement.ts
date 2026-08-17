import { z } from 'zod';

export const movementIdSchema = z
  .string()
  .min(3)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .brand<'MovementId'>();

export const movementContentVersionSchema = z
  .number()
  .int()
  .min(1)
  .max(2_147_483_647);

const plainTextSchema = (maximum: number) =>
  z
    .string()
    .min(1)
    .max(maximum)
    .refine((value) => value.trim() === value, 'Expected trimmed text')
    .refine((value) => value.normalize('NFC') === value, 'Expected NFC text')
    .refine(
      (value) => !/[\u0000-\u001f\u007f-\u009f]/u.test(value),
      'Control characters are not allowed',
    )
    .refine((value) => !/[<>]/u.test(value), 'HTML-like markup is not allowed');

const movementNameSchema = plainTextSchema(80);
const movementSummaryTextSchema = plainTextSchema(240);
const movementInstructionTextSchema = plainTextSchema(300);

export const movementSummarySchema = z
  .object({
    movementId: movementIdSchema,
    contentVersion: movementContentVersionSchema,
    name: movementNameSchema,
    summary: movementSummaryTextSchema,
  })
  .strict();

export const movementDetailSchema = movementSummarySchema
  .extend({
    setup: z.array(movementInstructionTextSchema).min(1).max(8),
    steps: z.array(movementInstructionTextSchema).min(1).max(12),
    cues: z.array(movementInstructionTextSchema).min(1).max(8),
    commonMistakes: z.array(movementInstructionTextSchema).min(1).max(8),
    safetyNotes: z.array(movementInstructionTextSchema).min(1).max(6),
  })
  .strict();

export const movementListResponseSchema = z
  .object({
    items: z.array(movementSummarySchema).max(100),
  })
  .strict();

export const movementEmptyQuerySchema = z.object({}).strict();

export const movementDetailParamsSchema = z
  .object({
    movementId: movementIdSchema,
  })
  .strict();

export const movementDetailResponseSchema = movementDetailSchema;

export type MovementId = z.infer<typeof movementIdSchema>;
export type MovementContentVersion = z.infer<
  typeof movementContentVersionSchema
>;
export type MovementSummary = z.infer<typeof movementSummarySchema>;
export type MovementDetail = z.infer<typeof movementDetailSchema>;
export type MovementListResponse = z.infer<typeof movementListResponseSchema>;
export type MovementEmptyQuery = z.infer<typeof movementEmptyQuerySchema>;
export type MovementDetailParams = z.infer<typeof movementDetailParamsSchema>;
export type MovementDetailResponse = z.infer<
  typeof movementDetailResponseSchema
>;
