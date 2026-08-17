import { and, desc, eq, isNull } from 'drizzle-orm';
import {
  createActiveStudentCoachLink,
  endStudentCoachLink,
  type CoachRepository,
  type StudentCoachLinkRepository,
  type StudentRepository,
} from '@fitness-os/domain';
import {
  coachRecordSchema,
  studentCoachLinkSchema,
  studentRecordSchema,
  type CoachRecord,
  type StudentCoachLink,
  type StudentRecord,
} from '@fitness-os/schemas';

import {
  createPostgresConnection,
  type PostgresConnection,
} from './connection.js';
import { coaches, studentCoachLinks, students } from './schema.js';

export interface StudentCoachDatabase extends PostgresConnection {
  students: StudentRepository;
  coaches: CoachRepository;
  links: StudentCoachLinkRepository;
}

function isConstraintViolation(
  error: unknown,
  code: string,
  constraint: string,
): boolean {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === code &&
    'constraint_name' in error &&
    error.constraint_name === constraint
  ) {
    return true;
  }

  return (
    typeof error === 'object' &&
    error !== null &&
    'cause' in error &&
    isConstraintViolation(error.cause, code, constraint)
  );
}

function toStudentRecord(row: typeof students.$inferSelect): StudentRecord {
  return studentRecordSchema.parse({
    id: row.id,
    createdAt: new Date(row.createdAt).toISOString(),
  });
}

function toCoachRecord(row: typeof coaches.$inferSelect): CoachRecord {
  return coachRecordSchema.parse({
    id: row.id,
    createdAt: new Date(row.createdAt).toISOString(),
  });
}

function toStudentCoachLink(
  row: typeof studentCoachLinks.$inferSelect,
): StudentCoachLink {
  return studentCoachLinkSchema.parse({
    id: row.id,
    studentId: row.studentId,
    coachId: row.coachId,
    startedAt: new Date(row.startedAt).toISOString(),
    endedAt: row.endedAt === null ? null : new Date(row.endedAt).toISOString(),
  });
}

export function createStudentCoachDatabase(
  connectionString: string,
): StudentCoachDatabase {
  const connection = createPostgresConnection(connectionString);

  return {
    ...connection,
    students: {
      create: async (record) => {
        const validRecord = studentRecordSchema.parse(record);

        try {
          const [created] = await connection.db
            .insert(students)
            .values(validRecord)
            .returning();

          if (!created) {
            throw new Error('Student insert returned no record.');
          }

          return { status: 'created', value: toStudentRecord(created) };
        } catch (error) {
          if (isConstraintViolation(error, '23505', 'students_pkey')) {
            return { status: 'conflict' };
          }
          throw error;
        }
      },
      findById: async (id) => {
        const [row] = await connection.db
          .select()
          .from(students)
          .where(eq(students.id, id))
          .limit(1);

        return row ? toStudentRecord(row) : null;
      },
    },
    coaches: {
      create: async (record) => {
        const validRecord = coachRecordSchema.parse(record);

        try {
          const [created] = await connection.db
            .insert(coaches)
            .values(validRecord)
            .returning();

          if (!created) {
            throw new Error('Coach insert returned no record.');
          }

          return { status: 'created', value: toCoachRecord(created) };
        } catch (error) {
          if (isConstraintViolation(error, '23505', 'coaches_pkey')) {
            return { status: 'conflict' };
          }
          throw error;
        }
      },
      findById: async (id) => {
        const [row] = await connection.db
          .select()
          .from(coaches)
          .where(eq(coaches.id, id))
          .limit(1);

        return row ? toCoachRecord(row) : null;
      },
    },
    links: {
      create: async (input) => {
        const validLink = createActiveStudentCoachLink(input);

        try {
          return await connection.db.transaction(async (transaction) => {
            const [studentRow] = await transaction
              .select({ id: students.id })
              .from(students)
              .where(eq(students.id, validLink.studentId))
              .for('update');
            const [coachRow] = await transaction
              .select({ id: coaches.id })
              .from(coaches)
              .where(eq(coaches.id, validLink.coachId))
              .for('update');

            if (!studentRow && !coachRow) {
              return {
                status: 'missing_references',
                missing: ['student', 'coach'],
              } as const;
            }
            if (!studentRow) {
              return {
                status: 'missing_references',
                missing: ['student'],
              } as const;
            }
            if (!coachRow) {
              return {
                status: 'missing_references',
                missing: ['coach'],
              } as const;
            }

            const [latestLink] = await transaction
              .select({
                startedAt: studentCoachLinks.startedAt,
                endedAt: studentCoachLinks.endedAt,
              })
              .from(studentCoachLinks)
              .where(
                and(
                  eq(studentCoachLinks.studentId, validLink.studentId),
                  eq(studentCoachLinks.coachId, validLink.coachId),
                ),
              )
              .orderBy(desc(studentCoachLinks.startedAt))
              .limit(1);

            if (
              latestLink &&
              (latestLink.endedAt === null ||
                validLink.startedAt <=
                  new Date(latestLink.endedAt).toISOString())
            ) {
              return { status: 'conflict' } as const;
            }

            const [created] = await transaction
              .insert(studentCoachLinks)
              .values(validLink)
              .returning();

            if (!created) {
              throw new Error('Student-coach link insert returned no record.');
            }

            return {
              status: 'created',
              value: toStudentCoachLink(created),
            } as const;
          });
        } catch (error) {
          if (
            isConstraintViolation(error, '23505', 'student_coach_links_pkey') ||
            isConstraintViolation(
              error,
              '23505',
              'student_coach_links_active_pair_unique',
            )
          ) {
            return { status: 'conflict' };
          }
          throw error;
        }
      },
      findById: async (id) => {
        const [row] = await connection.db
          .select()
          .from(studentCoachLinks)
          .where(eq(studentCoachLinks.id, id))
          .limit(1);

        return row ? toStudentCoachLink(row) : null;
      },
      findActive: async (studentId, coachId) => {
        const [row] = await connection.db
          .select()
          .from(studentCoachLinks)
          .where(
            and(
              eq(studentCoachLinks.studentId, studentId),
              eq(studentCoachLinks.coachId, coachId),
              isNull(studentCoachLinks.endedAt),
            ),
          )
          .limit(1);

        return row ? toStudentCoachLink(row) : null;
      },
      end: async (id, endedAt) =>
        connection.db.transaction(async (transaction) => {
          const [row] = await transaction
            .select()
            .from(studentCoachLinks)
            .where(eq(studentCoachLinks.id, id))
            .for('update');

          if (!row) {
            return { status: 'not_found' } as const;
          }

          const result = endStudentCoachLink(toStudentCoachLink(row), endedAt);
          if (result.status !== 'ended') {
            return result;
          }

          const [updated] = await transaction
            .update(studentCoachLinks)
            .set({ endedAt: result.value.endedAt })
            .where(
              and(
                eq(studentCoachLinks.id, id),
                isNull(studentCoachLinks.endedAt),
              ),
            )
            .returning();

          if (!updated) {
            throw new Error('Locked student-coach link could not be ended.');
          }

          return {
            status: 'ended',
            value: toStudentCoachLink(updated),
          } as const;
        }),
    },
  };
}
