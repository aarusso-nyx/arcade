import {
  bumpKeyState,
  createInitialState,
  emptyKeyStates,
  isWellFormedGuess,
  reduce,
  replayKeyStates,
  type GameState,
  type ValidGuessSource,
} from './state';

const dict = (...words: string[]): ValidGuessSource => {
  const s = new Set(words);
  return { has: (w) => s.has(w) };
};

const fresh = (solution: string): GameState =>
  createInitialState({ mode: 'infinite', solution });

describe('bumpKeyState', () => {
  it('promotes by rank only', () => {
    expect(bumpKeyState('unseen', 'absent')).toBe('absent');
    expect(bumpKeyState('absent', 'present')).toBe('present');
    expect(bumpKeyState('present', 'correct')).toBe('correct');
  });

  it('never demotes', () => {
    expect(bumpKeyState('correct', 'present')).toBe('correct');
    expect(bumpKeyState('correct', 'absent')).toBe('correct');
    expect(bumpKeyState('present', 'absent')).toBe('present');
  });
});

describe('emptyKeyStates', () => {
  it('initializes every A–Z to unseen', () => {
    const ks = emptyKeyStates();
    expect(Object.keys(ks).length).toBe(26);
    expect(ks['A']).toBe('unseen');
    expect(ks['Z']).toBe('unseen');
  });
});

describe('reduce', () => {
  describe('TYPE_LETTER', () => {
    it('appends to currentInput', () => {
      const s = fresh('ABATE');
      const { state } = reduce(s, { type: 'TYPE_LETTER', letter: 'A' }, dict());
      expect(state.currentInput).toBe('A');
    });

    it('caps at 5 letters', () => {
      let s = fresh('ABATE');
      for (const ch of 'ABCDEF') {
        s = reduce(s, { type: 'TYPE_LETTER', letter: ch }, dict()).state;
      }
      expect(s.currentInput).toBe('ABCDE');
    });

    it('ignores non-A-Z input', () => {
      const s = fresh('ABATE');
      const { state } = reduce(s, { type: 'TYPE_LETTER', letter: '1' }, dict());
      expect(state.currentInput).toBe('');
    });

    it('is a no-op after status === won', () => {
      const s = { ...fresh('ABATE'), status: 'won' as const };
      const { state } = reduce(s, { type: 'TYPE_LETTER', letter: 'A' }, dict());
      expect(state.currentInput).toBe('');
    });
  });

  describe('BACKSPACE', () => {
    it('removes one letter', () => {
      const s = { ...fresh('ABATE'), currentInput: 'ABC' };
      const { state } = reduce(s, { type: 'BACKSPACE' }, dict());
      expect(state.currentInput).toBe('AB');
    });

    it('is a no-op on empty input', () => {
      const s = fresh('ABATE');
      const { state } = reduce(s, { type: 'BACKSPACE' }, dict());
      expect(state.currentInput).toBe('');
    });
  });

  describe('SUBMIT', () => {
    it('shakes when under 5 letters', () => {
      const s = { ...fresh('ABATE'), currentInput: 'ABC' };
      const { state, effects } = reduce(s, { type: 'SUBMIT' }, dict('ABATE'));
      expect(state.currentInput).toBe('ABC');
      expect(state.currentRow).toBe(0);
      expect(effects.some((e) => e.type === 'SHAKE_ROW')).toBeTrue();
      expect(
        effects.some(
          (e) => e.type === 'TOAST' && e.message === 'letras faltando',
        ),
      ).toBeTrue();
    });

    it('shakes when word not in valid set', () => {
      const s = { ...fresh('ABATE'), currentInput: 'ZZZZZ' };
      const { state, effects } = reduce(s, { type: 'SUBMIT' }, dict('ABATE'));
      expect(state.currentInput).toBe('ZZZZZ');
      expect(state.currentRow).toBe(0);
      expect(
        effects.some(
          (e) => e.type === 'TOAST' && e.message === 'palavra inválida',
        ),
      ).toBeTrue();
    });

    it('accepts a valid guess: advances row, clears input, records evaluation', () => {
      const s = { ...fresh('ABATE'), currentInput: 'BANCO' };
      const { state, effects } = reduce(
        s,
        { type: 'SUBMIT' },
        dict('ABATE', 'BANCO'),
      );
      expect(state.guesses).toEqual(['BANCO']);
      expect(state.evaluations.length).toBe(1);
      expect(state.evaluations[0]).toEqual([
        'present', 'present', 'absent', 'absent', 'absent',
      ]);
      expect(state.currentRow).toBe(1);
      expect(state.currentInput).toBe('');
      expect(state.status).toBe('playing');
      expect(effects.some((e) => e.type === 'FLIP_REVEAL')).toBeTrue();
      expect(effects.some((e) => e.type === 'PERSIST')).toBeTrue();
    });

    it('sets status to won when guess equals solution', () => {
      const s = { ...fresh('ABATE'), currentInput: 'ABATE' };
      const { state, effects } = reduce(s, { type: 'SUBMIT' }, dict('ABATE'));
      expect(state.status).toBe('won');
      expect(effects.some((e) => e.type === 'BOUNCE_WIN')).toBeTrue();
    });

    it('sets status to lost on 6th wrong guess', () => {
      let s: GameState = fresh('ABATE');
      const words = ['MUNDO', 'CARPI', 'PLUMA', 'TROCA', 'PISCO', 'BANCO'];
      const guessDict = dict('ABATE', ...words);
      for (const g of words) {
        s = reduce(s, { type: 'TYPE_LETTER', letter: g[0] }, guessDict).state;
        s = reduce(s, { type: 'TYPE_LETTER', letter: g[1] }, guessDict).state;
        s = reduce(s, { type: 'TYPE_LETTER', letter: g[2] }, guessDict).state;
        s = reduce(s, { type: 'TYPE_LETTER', letter: g[3] }, guessDict).state;
        s = reduce(s, { type: 'TYPE_LETTER', letter: g[4] }, guessDict).state;
        s = reduce(s, { type: 'SUBMIT' }, guessDict).state;
      }
      expect(s.status).toBe('lost');
      expect(s.guesses.length).toBe(6);
    });

    it('updates keyStates with green/yellow/gray', () => {
      const s = { ...fresh('ABATE'), currentInput: 'BANCO' };
      const { state } = reduce(s, { type: 'SUBMIT' }, dict('ABATE', 'BANCO'));
      // BANCO vs ABATE: B present (in word), A present (in word), N absent, C absent, O absent.
      expect(state.keyStates['B']).toBe('present');
      expect(state.keyStates['A']).toBe('present');
      expect(state.keyStates['N']).toBe('absent');
      expect(state.keyStates['C']).toBe('absent');
      expect(state.keyStates['O']).toBe('absent');
      expect(state.keyStates['Z']).toBe('unseen');
    });

    it('keyStates priority: a letter once green stays green', () => {
      // Solution: ABATE. First guess BANCO (A present at pos1). Then ATIVA.
      // ATIVA: A==A pos0 green, T present, I absent, V absent, A absent (only one A left in pool).
      // After first guess A is present; after second A becomes correct.
      let s: GameState = fresh('ABATE');
      const dictionary = dict('ABATE', 'BANCO', 'ATIVA');
      s = { ...s, currentInput: 'BANCO' };
      s = reduce(s, { type: 'SUBMIT' }, dictionary).state;
      expect(s.keyStates['A']).toBe('present');
      s = { ...s, currentInput: 'ATIVA' };
      s = reduce(s, { type: 'SUBMIT' }, dictionary).state;
      expect(s.keyStates['A']).toBe('correct');

      // Now if we played a third hypothetical guess where A becomes present
      // again at a wrong position, it must remain correct.
      const ks = { ...s.keyStates, A: 'correct' as const };
      expect(
        bumpKeyState(ks['A'], 'present'),
      ).toBe('correct');
    });

    it('no-op after game has been won', () => {
      const s = { ...fresh('ABATE'), status: 'won' as const, currentInput: 'ABCDE' };
      const { state, effects } = reduce(s, { type: 'SUBMIT' }, dict('ABCDE'));
      expect(state).toBe(s);
      expect(effects).toEqual([]);
    });
  });
});

describe('reduce with variable wordLength', () => {
  it('createInitialState picks wordLength + maxAttempts from solution', () => {
    const s5 = createInitialState({ mode: 'infinite', solution: 'ABATE' });
    expect(s5.wordLength).toBe(5);
    expect(s5.maxAttempts).toBe(6);

    const s6 = createInitialState({ mode: 'infinite', solution: 'BANANA' });
    expect(s6.wordLength).toBe(6);
    expect(s6.maxAttempts).toBe(7);

    const s7 = createInitialState({ mode: 'infinite', solution: 'ABACATE' });
    expect(s7.wordLength).toBe(7);
    expect(s7.maxAttempts).toBe(8);
  });

  it('SUBMIT accepts a 6-letter guess and advances the row', () => {
    const s0 = createInitialState({ mode: 'infinite', solution: 'BANANA' });
    const s1 = { ...s0, currentInput: 'CARROS' };
    const { state } = reduce(s1, { type: 'SUBMIT' }, dict('BANANA', 'CARROS'));
    expect(state.guesses).toEqual(['CARROS']);
    expect(state.currentRow).toBe(1);
    expect(state.evaluations[0]).toHaveSize(6);
    expect(state.status).toBe('playing');
  });

  it('SUBMIT under 6 letters shakes (does not submit)', () => {
    const s0 = createInitialState({ mode: 'infinite', solution: 'BANANA' });
    const s1 = { ...s0, currentInput: 'BANAN' }; // only 5
    const { state, effects } = reduce(s1, { type: 'SUBMIT' }, dict('BANANA'));
    expect(state.currentRow).toBe(0);
    expect(state.guesses).toEqual([]);
    expect(effects.some((e) => e.type === 'SHAKE_ROW')).toBeTrue();
  });

  it('TYPE_LETTER caps at wordLength (6)', () => {
    let s: GameState = createInitialState({ mode: 'infinite', solution: 'BANANA' });
    for (const ch of 'ABCDEFG') {
      s = reduce(s, { type: 'TYPE_LETTER', letter: ch }, dict()).state;
    }
    expect(s.currentInput).toBe('ABCDEF');
  });

  it('lost on (wordLength + 1)th wrong guess for 6-letter game', () => {
    let s: GameState = createInitialState({ mode: 'infinite', solution: 'BANANA' });
    const words = ['CARROS', 'BOLOTA', 'DIVIDA', 'PEDIDO', 'JOGADO', 'LEITES', 'TROCAR'];
    const d = dict('BANANA', ...words);
    for (const g of words) {
      for (const ch of g) {
        s = reduce(s, { type: 'TYPE_LETTER', letter: ch }, d).state;
      }
      s = reduce(s, { type: 'SUBMIT' }, d).state;
    }
    expect(s.status).toBe('lost');
    expect(s.guesses.length).toBe(7);
  });

  it('accepts a 7-letter guess and produces a 7-tile evaluation row', () => {
    const s0 = createInitialState({ mode: 'infinite', solution: 'ABACATE' });
    const s1 = { ...s0, currentInput: 'ABACATE' };
    const { state } = reduce(s1, { type: 'SUBMIT' }, dict('ABACATE'));
    expect(state.status).toBe('won');
    expect(state.wordLength).toBe(7);
    expect(state.maxAttempts).toBe(8);
    expect(state.evaluations[0]).toHaveSize(7);
    expect(state.evaluations[0].every((e) => e === 'correct')).toBeTrue();
  });
});

describe('isWellFormedGuess', () => {
  it('accepts a clean uppercase A-Z string of the target length', () => {
    expect(isWellFormedGuess('FALOU', 5)).toBeTrue();
  });

  it('rejects mismatched length', () => {
    expect(isWellFormedGuess('FALO', 5)).toBeFalse();
    expect(isWellFormedGuess('FALOUX', 5)).toBeFalse();
  });

  it('rejects digits, punctuation, and non-ASCII letters', () => {
    expect(isWellFormedGuess('FAL0U', 5)).toBeFalse();
    expect(isWellFormedGuess('FAL-U', 5)).toBeFalse();
    expect(isWellFormedGuess('FALÃO', 5)).toBeFalse(); // normalize happens upstream
  });

  it('rejects lowercase (reducer input is expected pre-uppercased)', () => {
    expect(isWellFormedGuess('falou', 5)).toBeFalse();
  });
});

describe('reduce with lenient option', () => {
  it('default (lenient omitted) still rejects unknown words with a shake', () => {
    const s = { ...fresh('ABATE'), currentInput: 'FALOU' };
    const { state, effects } = reduce(s, { type: 'SUBMIT' }, dict('ABATE'));
    expect(state.currentRow).toBe(0);
    expect(effects.some((e) => e.type === 'SHAKE_ROW')).toBeTrue();
    expect(
      effects.some(
        (e) => e.type === 'TOAST' && e.message === 'palavra inválida',
      ),
    ).toBeTrue();
  });

  it('explicit lenient=false behaves the same as the default', () => {
    const s = { ...fresh('ABATE'), currentInput: 'FALOU' };
    const { effects } = reduce(
      s,
      { type: 'SUBMIT' },
      dict('ABATE'),
      { lenient: false },
    );
    expect(effects.some((e) => e.type === 'SHAKE_ROW')).toBeTrue();
  });

  it('lenient=true accepts a well-formed unknown guess with a warning toast', () => {
    const s = { ...fresh('ABATE'), currentInput: 'FALOU' };
    const { state, effects } = reduce(
      s,
      { type: 'SUBMIT' },
      dict('ABATE'),
      { lenient: true },
    );
    expect(state.guesses).toEqual(['FALOU']);
    expect(state.currentRow).toBe(1);
    expect(state.currentInput).toBe('');
    expect(state.status).toBe('playing');
    expect(effects.some((e) => e.type === 'SHAKE_ROW')).toBeFalse();
    expect(effects.some((e) => e.type === 'FLIP_REVEAL')).toBeTrue();
    expect(
      effects.some(
        (e) =>
          e.type === 'TOAST' &&
          e.message === 'palavra incomum' &&
          e.variant === 'warning',
      ),
    ).toBeTrue();
  });

  it('lenient=true does NOT emit the warning toast for known dictionary words', () => {
    const s = { ...fresh('ABATE'), currentInput: 'BANCO' };
    const { effects } = reduce(
      s,
      { type: 'SUBMIT' },
      dict('ABATE', 'BANCO'),
      { lenient: true },
    );
    expect(
      effects.some(
        (e) => e.type === 'TOAST' && e.message === 'palavra incomum',
      ),
    ).toBeFalse();
  });

  it('lenient=true still shakes when the guess has bad characters', () => {
    // Reducer never sees non-A-Z from TYPE_LETTER, but if state was mutated
    // externally (or a future entry path allows it), lenient must not paper
    // over ill-formed input.
    const s = { ...fresh('ABATE'), currentInput: 'FAL0U' };
    const { state, effects } = reduce(
      s,
      { type: 'SUBMIT' },
      dict('ABATE'),
      { lenient: true },
    );
    expect(state.currentRow).toBe(0);
    expect(effects.some((e) => e.type === 'SHAKE_ROW')).toBeTrue();
    expect(
      effects.some(
        (e) => e.type === 'TOAST' && e.message === 'palavra inválida',
      ),
    ).toBeTrue();
  });

  it('lenient=true can result in a WIN when the guess happens to be the solution', () => {
    const s = { ...fresh('FALOU'), currentInput: 'FALOU' };
    const { state, effects } = reduce(
      s,
      { type: 'SUBMIT' },
      dict(), // solution not in the "valid guesses" set
      { lenient: true },
    );
    expect(state.status).toBe('won');
    expect(effects.some((e) => e.type === 'BOUNCE_WIN')).toBeTrue();
  });
});

describe('replayKeyStates', () => {
  it('rebuilds key colors from submitted guesses', () => {
    const ks = replayKeyStates(
      ['BANCO', 'ABATE'],
      [
        ['present', 'present', 'absent', 'absent', 'absent'],
        ['correct', 'correct', 'correct', 'correct', 'correct'],
      ],
    );
    expect(ks['B']).toBe('correct');
    expect(ks['A']).toBe('correct');
    expect(ks['T']).toBe('correct');
    expect(ks['E']).toBe('correct');
    expect(ks['N']).toBe('absent');
    expect(ks['C']).toBe('absent');
    expect(ks['O']).toBe('absent');
    expect(ks['Z']).toBe('unseen');
  });
});
