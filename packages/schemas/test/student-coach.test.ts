import { describe, expect, it } from 'vitest';

import {
  coachRecordSchema,
  coachIdSchema,
  studentCoachLinkSchema,
  studentCoachLinkIdSchema,
  studentRecordSchema,
  studentIdSchema,
  type CoachId,
  type StudentCoachLinkId,
  type StudentId,
} from '../src/student-coach.js';

const studentId = '11111111-1111-4111-8111-111111111111';
const coachId = '22222222-2222-4222-8222-222222222222';
const linkId = '33333333-3333-4333-8333-333333333333';
const startedAt = '2026-08-16T12:34:56.789Z';

describe('student and coach identifiers', () => {
  it('accepts separately branded UUIDv4 values', () => {
    expect(studentIdSchema.parse(studentId)).toBe(studentId);
    expect(coachIdSchema.parse(coachId)).toBe(coachId);
    expect(studentCoachLinkIdSchema.parse(linkId)).toBe(linkId);
  });

  it.each([
    'not-a-uuid',
    '11111111-1111-1111-8111-111111111111',
    '11111111-1111-4111-7111-111111111111',
  ])('rejects a non-UUIDv4 value: %s', (value) => {
    expect(studentIdSchema.safeParse(value).success).toBe(false);
  });
});

describe('student and coach records', () => {
  it('accepts exact records with canonical UTC millisecond timestamps', () => {
    expect(
      studentRecordSchema.parse({ id: studentId, createdAt: startedAt }),
    ).toEqual({
      id: studentId,
      createdAt: startedAt,
    });
    expect(
      coachRecordSchema.parse({ id: coachId, createdAt: startedAt }),
    ).toEqual({
      id: coachId,
      createdAt: startedAt,
    });
  });

  it.each([
    '2026-08-16T12:34:56Z',
    '2026-08-16T12:34:56.78Z',
    '2026-08-16T12:34:56.789+00:00',
    '2026-02-30T12:34:56.789Z',
  ])('rejects a non-canonical timestamp: %s', (createdAt) => {
    expect(
      studentRecordSchema.safeParse({ id: studentId, createdAt }).success,
    ).toBe(false);
  });

  it('rejects unknown and profile fields', () => {
    expect(
      studentRecordSchema.safeParse({
        id: studentId,
        createdAt: startedAt,
        name: 'Ada',
      }).success,
    ).toBe(false);
    expect(
      coachRecordSchema.safeParse({
        id: coachId,
        createdAt: startedAt,
        email: 'x@example.test',
      }).success,
    ).toBe(false);
  });
});

describe('student-coach links', () => {
  const activeLink = {
    id: linkId,
    studentId,
    coachId,
    startedAt,
    endedAt: null,
  };

  it('accepts active and strictly later ended intervals', () => {
    expect(studentCoachLinkSchema.parse(activeLink)).toEqual(activeLink);
    expect(
      studentCoachLinkSchema.parse({
        ...activeLink,
        endedAt: '2026-08-16T12:34:56.790Z',
      }).endedAt,
    ).toBe('2026-08-16T12:34:56.790Z');
  });

  it.each([startedAt, '2026-08-16T12:34:56.788Z'])(
    'rejects an end that is not strictly later: %s',
    (endedAt) => {
      expect(
        studentCoachLinkSchema.safeParse({ ...activeLink, endedAt }).success,
      ).toBe(false);
    },
  );

  it('rejects omitted nullability and unknown fields', () => {
    const { endedAt: _endedAt, ...withoutEndedAt } = activeLink;
    expect(studentCoachLinkSchema.safeParse(withoutEndedAt).success).toBe(
      false,
    );
    expect(
      studentCoachLinkSchema.safeParse({ ...activeLink, role: 'owner' })
        .success,
    ).toBe(false);
  });
});

const parsedStudentId: StudentId = studentIdSchema.parse(studentId);
const parsedCoachId: CoachId = coachIdSchema.parse(coachId);
const parsedLinkId: StudentCoachLinkId = studentCoachLinkIdSchema.parse(linkId);

// @ts-expect-error A coach ID is not a student ID.
const invalidStudentId: StudentId = parsedCoachId;
// @ts-expect-error A link ID is not a coach ID.
const invalidCoachId: CoachId = parsedLinkId;
// @ts-expect-error A student ID is not a link ID.
const invalidLinkId: StudentCoachLinkId = parsedStudentId;

void invalidStudentId;
void invalidCoachId;
void invalidLinkId;
