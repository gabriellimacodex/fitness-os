import { movementSummarySchema } from '@fitness-os/schemas';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { HomeView } from './home-view';

const today = movementSummarySchema.parse({
  movementId: 'bodyweight-squat',
  contentVersion: 1,
  name: 'Bodyweight squat',
  summary: 'A slow sit-and-stand using only body weight and a stable stance.',
});

describe('home page', () => {
  it('puts today on the plate and keeps the library and join doors', () => {
    const markup = renderToStaticMarkup(<HomeView today={today} />);

    expect(markup).toContain('Open the plate');
    expect(markup).toContain('href="/movements/bodyweight-squat"');
    expect(markup).toContain('href="/movements"');
    expect(markup).toContain('href="/onboarding"');
  });
});
