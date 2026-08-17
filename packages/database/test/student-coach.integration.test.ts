import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { coaches, studentCoachLinks, students } from '../src/schema.js';

describe('PRD 02 database schema', () => {
  it('defines the exact student record columns', () => {
    const table = getTableConfig(students);

    expect(table.name).toBe('students');
    expect(table.columns.map((column) => column.name)).toEqual([
      'id',
      'created_at',
    ]);
  });

  it('defines the exact coach record columns', () => {
    const table = getTableConfig(coaches);

    expect(table.name).toBe('coaches');
    expect(table.columns.map((column) => column.name)).toEqual([
      'id',
      'created_at',
    ]);
  });

  it('defines the exact temporal link columns', () => {
    const table = getTableConfig(studentCoachLinks);

    expect(table.name).toBe('student_coach_links');
    expect(table.columns.map((column) => column.name)).toEqual([
      'id',
      'student_id',
      'coach_id',
      'started_at',
      'ended_at',
    ]);
  });

  it('defines the temporal, referential, active-pair, and lookup protections', () => {
    const table = getTableConfig(studentCoachLinks);

    expect(table.foreignKeys).toHaveLength(2);
    expect(
      table.foreignKeys.every(
        (foreignKey) => foreignKey.onDelete === 'restrict',
      ),
    ).toBe(true);
    expect(table.checks.map((check) => check.name)).toEqual([
      'student_coach_links_ended_after_started_check',
    ]);
    expect(
      table.indexes.map((index) => ({
        name: index.config.name,
        unique: index.config.unique,
        partial: index.config.where !== undefined,
      })),
    ).toEqual([
      {
        name: 'student_coach_links_active_pair_unique',
        unique: true,
        partial: true,
      },
      {
        name: 'student_coach_links_student_started_idx',
        unique: false,
        partial: false,
      },
      {
        name: 'student_coach_links_coach_started_idx',
        unique: false,
        partial: false,
      },
    ]);
  });
});
