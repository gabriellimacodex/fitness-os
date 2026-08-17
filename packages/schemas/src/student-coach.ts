import { z } from 'zod';

const canonicalUtcTimestampSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  .refine((value) => {
    const parsed = new Date(value);
    return !Number.isNaN(parsed.valueOf()) && parsed.toISOString() === value;
  }, 'Expected a canonical UTC timestamp with millisecond precision');

export const studentIdSchema = z.uuidv4().brand<'StudentId'>();
export const coachIdSchema = z.uuidv4().brand<'CoachId'>();
export const studentCoachLinkIdSchema = z
  .uuidv4()
  .brand<'StudentCoachLinkId'>();

export const studentRecordSchema = z
  .object({
    id: studentIdSchema,
    createdAt: canonicalUtcTimestampSchema,
  })
  .strict();

export const coachRecordSchema = z
  .object({
    id: coachIdSchema,
    createdAt: canonicalUtcTimestampSchema,
  })
  .strict();

export const studentCoachLinkSchema = z
  .object({
    id: studentCoachLinkIdSchema,
    studentId: studentIdSchema,
    coachId: coachIdSchema,
    startedAt: canonicalUtcTimestampSchema,
    endedAt: canonicalUtcTimestampSchema.nullable(),
  })
  .strict()
  .superRefine((link, context) => {
    if (link.endedAt !== null && link.endedAt <= link.startedAt) {
      context.addIssue({
        code: 'custom',
        message: 'endedAt must be strictly later than startedAt',
        path: ['endedAt'],
      });
    }
  });

export type StudentId = z.infer<typeof studentIdSchema>;
export type CoachId = z.infer<typeof coachIdSchema>;
export type StudentCoachLinkId = z.infer<typeof studentCoachLinkIdSchema>;
export type StudentRecord = z.infer<typeof studentRecordSchema>;
export type CoachRecord = z.infer<typeof coachRecordSchema>;
export type StudentCoachLink = z.infer<typeof studentCoachLinkSchema>;
