import {
  _resetWordListCache,
  loadWordLists,
  SUPPORTED_LENGTHS,
  type WordLength,
} from './wordlist';

interface FakeAssets {
  [path: string]: string;
}

function installFetch(assets: FakeAssets): jasmine.Spy {
  const spy = spyOn(window, 'fetch').and.callFake(
    async (input: RequestInfo | URL): Promise<Response> => {
      const url = typeof input === 'string' ? input : (input as URL).toString();
      // Strip the assets/termo/ prefix.
      const name = url.replace(/^.*assets\/termo\//, '');
      if (Object.prototype.hasOwnProperty.call(assets, name)) {
        return new Response(assets[name], { status: 200 });
      }
      return new Response('', { status: 404, statusText: 'Not Found' });
    },
  );
  return spy;
}

describe('loadWordLists', () => {
  beforeEach(() => {
    _resetWordListCache();
  });

  it('uses unsuffixed filenames for length 5', async () => {
    const fetchSpy = installFetch({
      'solutions.txt': 'abate\nbanco\n',
      'valid-guesses.txt': 'abate\nbanco\nplaca\n',
      'solutions-accented.txt': 'abaté\nbanco\n',
    });
    const lists = await loadWordLists(5);
    expect(lists.wordLength).toBe(5);
    expect(lists.solutions).toEqual(['ABATE', 'BANCO']);
    expect(lists.solutionsAccented).toEqual(['abaté', 'banco']);
    expect(lists.validGuesses.has('PLACA')).toBeTrue();
    expect(lists.validGuesses.has('ABATE')).toBeTrue();
    // All three URLs should have been fetched.
    const calls = fetchSpy.calls.allArgs().map((a) => a[0] as string);
    expect(calls.some((u) => u.endsWith('solutions.txt'))).toBeTrue();
    expect(calls.some((u) => u.endsWith('valid-guesses.txt'))).toBeTrue();
    expect(calls.some((u) => u.endsWith('solutions-accented.txt'))).toBeTrue();
  });

  it('uses -{N}-suffixed filenames for lengths 6 and 7', async () => {
    const fetchSpy = installFetch({
      'solutions-6.txt': 'banana\ncarros\n',
      'valid-guesses-6.txt': 'banana\ncarros\n',
      'solutions-6-accented.txt': 'banana\ncarros\n',
      'solutions-7.txt': 'abacate\nbanhada\n',
      'valid-guesses-7.txt': 'abacate\nbanhada\n',
      'solutions-7-accented.txt': 'abacate\nbanhada\n',
    });

    const lists6 = await loadWordLists(6);
    expect(lists6.wordLength).toBe(6);
    expect(lists6.solutions).toEqual(['BANANA', 'CARROS']);
    expect(lists6.solutions.every((w) => w.length === 6)).toBeTrue();

    const lists7 = await loadWordLists(7);
    expect(lists7.wordLength).toBe(7);
    expect(lists7.solutions).toEqual(['ABACATE', 'BANHADA']);
    expect(lists7.solutions.every((w) => w.length === 7)).toBeTrue();

    // Verify the right file paths were requested for each length.
    const urls = fetchSpy.calls.allArgs().map((a) => a[0] as string);
    expect(urls.some((u) => u.endsWith('solutions-6.txt'))).toBeTrue();
    expect(urls.some((u) => u.endsWith('valid-guesses-6.txt'))).toBeTrue();
    expect(urls.some((u) => u.endsWith('solutions-7.txt'))).toBeTrue();
    expect(urls.some((u) => u.endsWith('valid-guesses-7.txt'))).toBeTrue();
  });

  it('caches per-length so a second load does not refetch', async () => {
    const fetchSpy = installFetch({
      'solutions-6.txt': 'banana\n',
      'valid-guesses-6.txt': 'banana\n',
      'solutions-6-accented.txt': 'banana\n',
    });
    const a = await loadWordLists(6);
    const b = await loadWordLists(6);
    expect(b).toBe(a);
    // 3 initial fetches (solutions, guesses, accented), no extra on second call.
    expect(fetchSpy.calls.count()).toBe(3);
  });

  it('falls back gracefully when the accented file is missing', async () => {
    installFetch({
      'solutions-6.txt': 'banana\n',
      'valid-guesses-6.txt': 'banana\n',
      // no accented file
    });
    const lists = await loadWordLists(6);
    expect(lists.solutionsAccented).toEqual(lists.solutions);
  });

  it('filters out words whose normalized length does not match', async () => {
    installFetch({
      'solutions-6.txt': 'banana\nxxx\ntoolong7\n',
      'valid-guesses-6.txt': 'banana\nxxx\n',
      'solutions-6-accented.txt': 'banana\nxxx\ntoolong\n',
    });
    const lists = await loadWordLists(6);
    expect(lists.solutions).toEqual(['BANANA']);
    expect(lists.solutions.every((w) => w.length === 6)).toBeTrue();
  });

  it('every solution is included in validGuesses', async () => {
    installFetch({
      'solutions-6.txt': 'banana\ncarros\n',
      // guesses missing CARROS — loader must add it.
      'valid-guesses-6.txt': 'banana\n',
      'solutions-6-accented.txt': 'banana\ncarros\n',
    });
    const lists = await loadWordLists(6);
    expect(lists.validGuesses.has('CARROS')).toBeTrue();
    expect(lists.validGuesses.has('BANANA')).toBeTrue();
  });

  it('SUPPORTED_LENGTHS contains 5, 6, 7', () => {
    expect(SUPPORTED_LENGTHS).toEqual([5, 6, 7] as readonly WordLength[]);
  });
});
