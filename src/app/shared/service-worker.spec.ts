import { registerServiceWorker } from './service-worker';

describe('registerServiceWorker', () => {
  let originalSW: PropertyDescriptor | undefined;
  let originalHostname: string;
  let registerSpy: jasmine.Spy;

  beforeEach(() => {
    originalSW = Object.getOwnPropertyDescriptor(Navigator.prototype, 'serviceWorker');
    originalHostname = window.location.hostname;

    registerSpy = jasmine.createSpy('register').and.returnValue(Promise.resolve(undefined));
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      get: () => ({ register: registerSpy }),
    });
  });

  afterEach(() => {
    if (originalSW) {
      Object.defineProperty(Navigator.prototype, 'serviceWorker', originalSW);
    } else {
      // Best-effort restore: delete the override we put on the instance.
      try {
        delete (navigator as unknown as { serviceWorker?: unknown }).serviceWorker;
      } catch {
        /* ignore */
      }
    }
  });

  function fireLoad(): void {
    window.dispatchEvent(new Event('load'));
  }

  it('does nothing on localhost', () => {
    // Karma runs on localhost — this exercises the dev-server bail-out.
    expect(window.location.hostname).toBe('localhost');
    registerServiceWorker();
    fireLoad();
    expect(registerSpy).not.toHaveBeenCalled();
  });

  it('registers exactly once on the load event when off localhost', () => {
    // Karma runs the spec on localhost, where the registration path bails out.
    // window.location.hostname is non-configurable in Chrome (jasmine
    // spyOnProperty throws), so we test the off-localhost path by injecting
    // an explicit hostname override the helper accepts.
    registerServiceWorker({ hostname: 'nyx-arcade.example' });
    expect(registerSpy).not.toHaveBeenCalled(); // deferred until load
    fireLoad();
    expect(registerSpy).toHaveBeenCalledTimes(1);
    expect(registerSpy).toHaveBeenCalledWith('sw.js');
    void originalHostname;
  });
});
