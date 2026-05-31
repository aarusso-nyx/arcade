import { evaluateGuess } from './evaluator';

describe('evaluateGuess', () => {
  it('all-green when guess equals solution', () => {
    expect(evaluateGuess('ABATE', 'ABATE')).toEqual([
      'correct', 'correct', 'correct', 'correct', 'correct',
    ]);
  });

  it('all-gray when no letters overlap', () => {
    expect(evaluateGuess('MUNDO', 'CARPI')).toEqual([
      'absent', 'absent', 'absent', 'absent', 'absent',
    ]);
  });

  it('mixed without duplicates: ABATE / BANCO', () => {
    expect(evaluateGuess('BANCO', 'ABATE')).toEqual([
      'present', 'present', 'absent', 'absent', 'absent',
    ]);
  });

  it('LLAMA / ALLOY canonical example', () => {
    expect(evaluateGuess('ALLOY', 'LLAMA')).toEqual([
      'present', 'correct', 'present', 'absent', 'absent',
    ]);
  });

  it('MOMMY / MAMMA — solution and guess each have many duplicates', () => {
    expect(evaluateGuess('MAMMA', 'MOMMY')).toEqual([
      'correct', 'absent', 'correct', 'correct', 'absent',
    ]);
  });

  it('MOMMY / MMMMA — three Ms in guess against three Ms in solution', () => {
    expect(evaluateGuess('MMMMA', 'MOMMY')).toEqual([
      'correct', 'absent', 'correct', 'correct', 'absent',
    ]);
  });

  it('BOOKS / OOOOO — guess of five Os against solution with two Os', () => {
    // Pass 1 marks the exact O matches at positions 1 and 2 as correct and
    // exhausts the solution's O pool. Pass 2 sees no Os left, so positions
    // 0, 3, 4 are all absent.
    expect(evaluateGuess('OOOOO', 'BOOKS')).toEqual([
      'absent', 'correct', 'correct', 'absent', 'absent',
    ]);
  });

  it('ABCDE / AAAAA — five As against one A at position 0', () => {
    expect(evaluateGuess('AAAAA', 'ABCDE')).toEqual([
      'correct', 'absent', 'absent', 'absent', 'absent',
    ]);
  });

  it('AABCD / BABCD — leftmost present rule', () => {
    expect(evaluateGuess('BABCD', 'AABCD')).toEqual([
      'absent', 'correct', 'correct', 'correct', 'correct',
    ]);
  });

  it('solution with duplicate letter, guess with one — guess letter colored', () => {
    // Solution BOOKS has 2 Os; guess OPERA has 1 O at pos 0.
    // Pass 1: pos0 O!=B. remaining = {B:1,O:2,K:1,S:1}.
    // Pass 2: pos0 O present (O--). pos1 P no. pos2 E no. pos3 R no. pos4 A no.
    expect(evaluateGuess('OPERA', 'BOOKS')).toEqual([
      'present', 'absent', 'absent', 'absent', 'absent',
    ]);
  });

  it('solution without duplicate, guess with two — only one colored', () => {
    // Solution WORLD (one O at pos1); guess OOZED (two Os at pos0/pos1).
    // Pass 1: pos1 O==O green. remaining = {W:1,R:1,L:1,D:1}. (D matches at pos4 too -> green).
    // pos4 D==D green. remaining = {W:1,R:1,L:1}.
    // Pass 2: pos0 O — no O in pool, absent. pos2 Z absent. pos3 E absent.
    expect(evaluateGuess('OOZED', 'WORLD')).toEqual([
      'absent', 'correct', 'absent', 'absent', 'correct',
    ]);
  });

  it('all five guess letters the same, solution has zero of that letter', () => {
    expect(evaluateGuess('XXXXX', 'ABCDE')).toEqual([
      'absent', 'absent', 'absent', 'absent', 'absent',
    ]);
  });

  it('guess equals solution permuted — every letter yellow', () => {
    expect(evaluateGuess('EBATA', 'ABATE')).toEqual([
      'present', 'correct', 'correct', 'correct', 'present',
    ]);
  });

  it('full permutation with no greens', () => {
    // ABCDE -> EABCD (rotated by one). No letter is in its original position.
    expect(evaluateGuess('EABCD', 'ABCDE')).toEqual([
      'present', 'present', 'present', 'present', 'present',
    ]);
  });

  it('ALELO / LLAMA exercise from spec', () => {
    // Solution ALELO: A-L-E-L-O. Guess LLAMA: L-L-A-M-A.
    // Pass 1: pos0 L!=A, pos1 L==L green, pos2 A!=E, pos3 M!=L, pos4 A!=O.
    // remaining = {A:1, E:1, L:1, O:1}.
    // Pass 2: pos0 L — present, L--. pos2 A — present, A--. pos3 M — absent.
    //         pos4 A — pool A is 0, absent.
    expect(evaluateGuess('LLAMA', 'ALELO')).toEqual([
      'present', 'correct', 'present', 'absent', 'absent',
    ]);
  });

  it('throws on wrong length', () => {
    expect(() => evaluateGuess('ABC', 'ABCDE')).toThrow();
    expect(() => evaluateGuess('ABCDE', 'ABCDEF')).toThrow();
  });
});
