import { describe, expect, it } from 'vitest';

import manifest from './manifest';

describe('PWA manifest route', () => {
  it('declares a standalone app manifest with a resolvable icon', () => {
    const result = manifest();

    expect(result.name).toBe('Fitness OS');
    expect(result.short_name).toBe('Fitness OS');
    expect(result.start_url).toBe('/');
    expect(result.display).toBe('standalone');
    expect(result.background_color).toBe('#f4f1eb');
    expect(result.theme_color).toBe('#f4f1eb');
  });

  it('declares at least one icon referencing an existing public asset', () => {
    const result = manifest();

    expect(result.icons).toBeDefined();
    expect(result.icons?.length).toBeGreaterThan(0);

    for (const icon of result.icons ?? []) {
      expect(icon.src).toBe('/icon.svg');
      expect(icon.type).toBe('image/svg+xml');
    }
  });
});
