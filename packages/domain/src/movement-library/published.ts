import { movementDetailSchema, type MovementDetail } from '@fitness-os/schemas';

const squat = movementDetailSchema.parse({
  movementId: 'bodyweight-squat',
  contentVersion: 1,
  name: 'Bodyweight squat',
  summary: 'A slow sit-and-stand using only body weight and a stable stance.',
  setup: [
    'Stand with feet about hip-width apart.',
    'Keep the whole foot on the floor.',
  ],
  steps: [
    'Sit the hips back and down with control.',
    'Stop at a depth you can keep even.',
    'Stand back up without snapping the knees.',
  ],
  cues: ['Move slowly enough to stay balanced.'],
  commonMistakes: ['Dropping quickly or letting the heels lift.'],
  safetyNotes: [
    'Stop if you feel pain, dizziness, or loss of control and seek qualified help as appropriate.',
  ],
});

const hinge = movementDetailSchema.parse({
  movementId: 'hip-hinge',
  contentVersion: 1,
  name: 'Hip hinge',
  summary: 'A controlled hip-back fold that keeps the spine quiet.',
  setup: [
    'Stand tall with a slight bend in the knees.',
    'Rest the hands lightly on the thighs.',
  ],
  steps: [
    'Push the hips back as the torso leans forward.',
    'Stop when the hands reach mid-thigh or balance fades.',
    'Drive the hips forward to stand tall again.',
  ],
  cues: ['Move from the hips, not the neck.'],
  commonMistakes: ['Rounding the back to reach farther down.'],
  safetyNotes: [
    'Stop if you feel pain, dizziness, or loss of control and seek qualified help as appropriate.',
  ],
});

export const COMMITTED_PUBLISHED_MOVEMENTS: readonly MovementDetail[] =
  Object.freeze([squat, hinge]);
