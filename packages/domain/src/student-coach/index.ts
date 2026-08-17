import {
  studentCoachLinkSchema,
  type CoachId,
  type CoachRecord,
  type StudentCoachLink,
  type StudentCoachLinkId,
  type StudentId,
  type StudentRecord,
} from '@fitness-os/schemas';

export interface CreateStudentCoachLink {
  id: StudentCoachLinkId;
  studentId: StudentId;
  coachId: CoachId;
  startedAt: string;
}

export type CreateResult<T> =
  { status: 'created'; value: T } | { status: 'conflict' };

export type MissingStudentCoachReferences =
  readonly ['student'] | readonly ['coach'] | readonly ['student', 'coach'];

export type CreateLinkResult =
  | { status: 'created'; value: StudentCoachLink }
  | { status: 'conflict' }
  | {
      status: 'missing_references';
      missing: MissingStudentCoachReferences;
    };

export type EndLinkResult =
  | { status: 'ended'; value: StudentCoachLink }
  | { status: 'not_found' }
  | { status: 'already_ended' }
  | { status: 'invalid_interval' };

export interface StudentRepository {
  create(record: StudentRecord): Promise<CreateResult<StudentRecord>>;
  findById(id: StudentId): Promise<StudentRecord | null>;
}

export interface CoachRepository {
  create(record: CoachRecord): Promise<CreateResult<CoachRecord>>;
  findById(id: CoachId): Promise<CoachRecord | null>;
}

export interface StudentCoachLinkRepository {
  create(input: CreateStudentCoachLink): Promise<CreateLinkResult>;
  findById(id: StudentCoachLinkId): Promise<StudentCoachLink | null>;
  findActive(
    studentId: StudentId,
    coachId: CoachId,
  ): Promise<StudentCoachLink | null>;
  end(id: StudentCoachLinkId, endedAt: string): Promise<EndLinkResult>;
}

export function createActiveStudentCoachLink(
  input: CreateStudentCoachLink,
): StudentCoachLink {
  return studentCoachLinkSchema.parse({ ...input, endedAt: null });
}

export function endStudentCoachLink(
  link: StudentCoachLink,
  endedAt: string,
): EndLinkResult {
  if (link.endedAt !== null) {
    return { status: 'already_ended' };
  }

  const endedLink = studentCoachLinkSchema.safeParse({ ...link, endedAt });

  return endedLink.success
    ? { status: 'ended', value: endedLink.data }
    : { status: 'invalid_interval' };
}
