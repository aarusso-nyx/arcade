import { normalize } from './normalize';

describe('normalize', () => {
  it('strips acute accent', () => {
    expect(normalize('á')).toBe('A');
    expect(normalize('é')).toBe('E');
    expect(normalize('í')).toBe('I');
    expect(normalize('ó')).toBe('O');
    expect(normalize('ú')).toBe('U');
  });

  it('strips grave accent', () => {
    expect(normalize('à')).toBe('A');
  });

  it('strips circumflex', () => {
    expect(normalize('â')).toBe('A');
    expect(normalize('ê')).toBe('E');
    expect(normalize('ô')).toBe('O');
  });

  it('strips tilde', () => {
    expect(normalize('ã')).toBe('A');
    expect(normalize('õ')).toBe('O');
  });

  it('strips cedilla', () => {
    expect(normalize('ç')).toBe('C');
  });

  it('uppercases ASCII input', () => {
    expect(normalize('padrao')).toBe('PADRAO');
  });

  it('handles a full word with mixed diacritics', () => {
    expect(normalize('ação')).toBe('ACAO');
    expect(normalize('AÇÃO')).toBe('ACAO');
    expect(normalize('ácido')).toBe('ACIDO');
  });

  it('returns empty for empty input', () => {
    expect(normalize('')).toBe('');
  });

  it('is a no-op for already-normalized input', () => {
    expect(normalize('PADRAO')).toBe('PADRAO');
    expect(normalize('ABATE')).toBe('ABATE');
  });

  it('is idempotent', () => {
    const samples = ['ação', 'maçã', 'PADRAO', 'aaiún', 'aãâà', ''];
    for (const s of samples) {
      expect(normalize(normalize(s))).toBe(normalize(s));
    }
  });
});
