import type { TileEvaluation } from './evaluator';
import { buildShareString } from './share';

describe('buildShareString', () => {
  const winRows: TileEvaluation[][] = [
    ['absent', 'absent', 'present', 'absent', 'absent'],
    ['present', 'absent', 'correct', 'absent', 'absent'],
    ['correct', 'correct', 'correct', 'present', 'absent'],
    ['correct', 'correct', 'correct', 'correct', 'correct'],
  ];

  it('formats a win header with attempts/6', () => {
    const out = buildShareString({
      status: 'won',
      puzzleNumber: 142,
      guessCount: 4,
      evaluations: winRows,
    });
    expect(out.startsWith('Termo 142 4/6\n\n')).toBeTrue();
  });

  it('formats a loss header as X/6', () => {
    const out = buildShareString({
      status: 'lost',
      puzzleNumber: 9,
      guessCount: 6,
      evaluations: Array.from({ length: 6 }, () =>
        ['absent', 'absent', 'absent', 'absent', 'absent'] as TileEvaluation[],
      ),
    });
    expect(out.startsWith('Termo 9 X/6\n\n')).toBeTrue();
  });

  it('maps evaluations to the right emojis', () => {
    const out = buildShareString({
      status: 'won',
      puzzleNumber: 1,
      guessCount: 1,
      evaluations: [['correct', 'present', 'absent', 'correct', 'present']],
    });
    expect(out).toBe('Termo 1 1/6\n\n🟩🟨⬜🟩🟨');
  });

  it('contains no letters anywhere', () => {
    const out = buildShareString({
      status: 'won',
      puzzleNumber: 42,
      guessCount: 4,
      evaluations: winRows,
    });
    // After the header line, no A-Z or a-z should appear.
    const body = out.split('\n').slice(1).join('\n');
    expect(/[A-Za-z]/.test(body)).toBeFalse();
  });

  it('produces one row per submitted guess', () => {
    const out = buildShareString({
      status: 'won',
      puzzleNumber: 142,
      guessCount: 4,
      evaluations: winRows,
    });
    const gridLines = out.split('\n').slice(2);
    expect(gridLines.length).toBe(4);
  });

  it('has no trailing blank line', () => {
    const out = buildShareString({
      status: 'won',
      puzzleNumber: 1,
      guessCount: 1,
      evaluations: [['correct', 'correct', 'correct', 'correct', 'correct']],
    });
    expect(out.endsWith('\n')).toBeFalse();
  });
});
