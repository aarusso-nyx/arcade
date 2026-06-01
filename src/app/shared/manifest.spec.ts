/**
 * Smoke-tests the PWA manifest shipped in `public/manifest.webmanifest`.
 * Fetched at test time via the karma asset server (configured in angular.json).
 */
describe('manifest.webmanifest', () => {
  let manifest: Record<string, unknown>;

  beforeAll(async () => {
    const res = await fetch('/manifest.webmanifest');
    expect(res.ok).toBe(true);
    manifest = (await res.json()) as Record<string, unknown>;
  });

  it('declares required PWA fields', () => {
    expect(manifest['name']).toBe('NYX Arcade');
    expect(manifest['short_name']).toBe('NYX Arcade');
    expect(manifest['start_url']).toBe('./');
    expect(manifest['scope']).toBe('./');
    expect(manifest['display']).toBe('standalone');
    expect(manifest['background_color']).toBe('#14171c');
    expect(manifest['theme_color']).toBe('#1F7AA8');
  });

  it('ships icons covering 16, 32, 192, and 512 px', () => {
    const icons = manifest['icons'] as Array<{ sizes: string; src: string }>;
    expect(Array.isArray(icons)).toBe(true);
    const sizes = icons.map((i) => i.sizes).sort();
    expect(sizes).toEqual(['16x16', '192x192', '32x32', '512x512']);
    // Every src must be a non-empty relative path.
    for (const icon of icons) {
      expect(icon.src.length).toBeGreaterThan(0);
      expect(icon.src.startsWith('/')).toBe(false);
    }
  });

  it('tags the app under games + entertainment categories', () => {
    expect(manifest['categories']).toEqual(['games', 'entertainment']);
  });
});
