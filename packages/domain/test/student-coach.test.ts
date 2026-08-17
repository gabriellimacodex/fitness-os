import { describe, expect, it } from 'vitest';

import {
  coachIdSchema,
  studentCoachLinkIdSchema,
  studentIdSchema,
  type CoachRecord,
  type StudentCoachLink,
  type StudentRecord,
} from '@fitness-os/schemas';

import {
  createActiveStudentCoachLink,
  endStudentCoachLink,
  type CoachRepository,
  type CreateLinkResult,
  type CreateResult,
  type CreateStudentCoachLink,
  type EndLinkResult,
  type StudentCoachLinkRepository,
  type StudentRepository,
} from '../src/student-coach/index.js';

const input: CreateStudentCoachLink = {
  id: studentCoachLinkIdSchema.parse('33333333-3333-4333-8333-333333333333'),
  studentId: studentIdSchema.parse('11111111-1111-4111-8111-111111111111'),
  coachId: coachIdSchema.parse('22222222-2222-4222-8222-222222222222'),
  startedAt: '2026-08-16T12:34:56.789Z',
};

const invalidCreateInput: CreateStudentCoachLink = {
  ...input,
  // @ts-expect-error Link creation cannot provide historical state.
  endedAt: null,
};
void invalidCreateInput;

describe('createActiveStudentCoachLink', () => {
  it('constructs the exact schema-valid active link', () => {
    expect(createActiveStudentCoachLink(input)).toEqual({
      ...input,
      endedAt: null,
    });
  });

  it('rejects input that cannot satisfy the frozen link schema', () => {
    expect(() =>
      createActiveStudentCoachLink({
        ...input,
        startedAt: 'not-a-timestamp',
      }),
    ).toThrow();
  });
});

describe('endStudentCoachLink', () => {
  it('ends an active link once without changing its identity or start', () => {
    const activeLink = createActiveStudentCoachLink(input);
    const endedAt = '2026-08-16T12:34:56.790Z';

    expect(endStudentCoachLink(activeLink, endedAt)).toEqual({
      status: 'ended',
      value: { ...activeLink, endedAt },
    });
  });

  it('preserves an already-ended link before considering a new timestamp', () => {
    const firstEnd = endStudentCoachLink(
      createActiveStudentCoachLink(input),
      '2026-08-16T12:34:56.790Z',
    );
    expect(firstEnd.status).toBe('ended');
    if (firstEnd.status !== 'ended') {
      throw new Error('Expected the fixture link to end');
    }

    expect(endStudentCoachLink(firstEnd.value, 'malformed')).toEqual({
      status: 'already_ended',
    });
    expect(firstEnd.value.endedAt).toBe('2026-08-16T12:34:56.790Z');
  });

  it('rejects equal, reversed, and malformed end timestamps', () => {
    const activeLink = createActiveStudentCoachLink(input);

    for (const endedAt of [
      input.startedAt,
      '2026-08-16T12:34:56.788Z',
      '2026-08-16T12:34:56Z',
      'not-a-timestamp',
    ]) {
      expect(endStudentCoachLink(activeLink, endedAt)).toEqual({
        status: 'invalid_interval',
      });
      expect(activeLink.endedAt).toBeNull();
    }
  });
});

describe('repository contracts', () => {
  it('accepts focused repository implementations and explicit result variants', async () => {
    const student: StudentRecord = {
      id: input.studentId,
      createdAt: input.startedAt,
    };
    const coach: CoachRecord = {
      id: input.coachId,
      createdAt: input.startedAt,
    };
    const link = createActiveStudentCoachLink(input);

    const students: StudentRepository = {
      create: async (): Promise<CreateResult<StudentRecord>> => ({
        status: 'created',
        value: student,
      }),
      findById: async () => student,
    };
    const coaches: CoachRepository = {
      create: async (): Promise<CreateResult<CoachRecord>> => ({
        status: 'conflict',
      }),
      findById: async () => coach,
    };
    const links: StudentCoachLinkRepository = {
      create: async (): Promise<CreateLinkResult> => ({
        status: 'missing_references',
        missing: ['student', 'coach'],
      }),
      findById: async () => link,
      findActive: async () => link,
      end: async (): Promise<EndLinkResult> => ({ status: 'not_found' }),
    };

    expect(await students.create(student)).toEqual({
      status: 'created',
      value: student,
    });
    expect(await coaches.create(coach)).toEqual({ status: 'conflict' });
    expect(await links.create(input)).toEqual({
      status: 'missing_references',
      missing: ['student', 'coach'],
    });
    expect(await links.findById(input.id)).toEqual(link);
    expect(await links.findActive(input.studentId, input.coachId)).toEqual(
      link,
    );
    expect(await links.end(input.id, input.startedAt)).toEqual({
      status: 'not_found',
    });
  });
});

function describeCreateResult<T>(result: CreateResult<T>): string {
  switch (result.status) {
    case 'created':
      return 'created';
    case 'conflict':
      return 'conflict';
  }
}

function describeCreateLinkResult(result: CreateLinkResult): string {
  switch (result.status) {
    case 'created':
    case 'conflict':
    case 'missing_references':
      return result.status;
  }
}

function describeEndLinkResult(result: EndLinkResult): string {
  switch (result.status) {
    case 'ended':
    case 'not_found':
    case 'already_ended':
    case 'invalid_interval':
      return result.status;
  }
}

const typedLink: StudentCoachLink = createActiveStudentCoachLink(input);
void typedLink;
void describeCreateResult;
void describeCreateLinkResult;
void describeEndLinkResult;
