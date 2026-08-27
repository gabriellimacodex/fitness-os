import { sql } from 'drizzle-orm';
import {
  check,
  index,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export {
  SEEDED_TAXONOMY_DIMENSIONS,
  catalogOperations,
  exerciseLifecycleEvents,
  exerciseReferenceCandidates,
  exerciseRevisionReferences,
  exerciseRevisionTaxonomyTerms,
  exerciseRevisions,
  exercises,
  taxonomyDimensions,
  taxonomyLifecycleEvents,
  taxonomyTerms,
} from './catalog/tables.js';

export {
  privacyAuditEvent,
  privacyAuthorizationEvidence,
  privacyGovernanceLifecycleProof,
  privacyPolicyPackageVersion,
  privacyProcessorRegistration,
  privacyPurposeVersion,
  privacySubjectRequest,
  privacySubjectRequestTransition,
  privacyWithdrawal,
} from './privacy/tables.js';

export {
  onboardingAttempt,
  onboardingInvitation,
  onboardingOperation,
  onboardingRoleMapping,
} from './onboarding/tables.js';

export const students = pgTable('students', {
  id: uuid('id').primaryKey(),
  createdAt: timestamp('created_at', {
    mode: 'string',
    withTimezone: true,
  }).notNull(),
});

export const coaches = pgTable('coaches', {
  id: uuid('id').primaryKey(),
  createdAt: timestamp('created_at', {
    mode: 'string',
    withTimezone: true,
  }).notNull(),
});

export const studentCoachLinks = pgTable(
  'student_coach_links',
  {
    id: uuid('id').primaryKey(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'restrict' }),
    coachId: uuid('coach_id')
      .notNull()
      .references(() => coaches.id, { onDelete: 'restrict' }),
    startedAt: timestamp('started_at', {
      mode: 'string',
      withTimezone: true,
    }).notNull(),
    endedAt: timestamp('ended_at', {
      mode: 'string',
      withTimezone: true,
    }),
  },
  (table) => [
    check(
      'student_coach_links_ended_after_started_check',
      sql`${table.endedAt} IS NULL OR ${table.endedAt} > ${table.startedAt}`,
    ),
    uniqueIndex('student_coach_links_active_pair_unique')
      .on(table.studentId, table.coachId)
      .where(sql`${table.endedAt} IS NULL`),
    index('student_coach_links_student_started_idx').on(
      table.studentId,
      table.startedAt,
    ),
    index('student_coach_links_coach_started_idx').on(
      table.coachId,
      table.startedAt,
    ),
  ],
);
