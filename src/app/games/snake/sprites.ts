export const PIXEL_FONT = '"Press Start 2P"';

let pixelFontLoaded = false;
let pixelFontPromise: Promise<boolean> | undefined;

export function loadPixelFont(): Promise<boolean> {
  if (pixelFontPromise) return pixelFontPromise;

  if (typeof document === 'undefined' || !document.fonts) {
    pixelFontPromise = Promise.resolve(false);
    return pixelFontPromise;
  }

  const fontSpec = `8px ${PIXEL_FONT}`;
  if (document.fonts.check(fontSpec)) {
    pixelFontLoaded = true;
    pixelFontPromise = Promise.resolve(true);
    return pixelFontPromise;
  }

  pixelFontPromise = document.fonts
    .load(fontSpec)
    .then(() => {
      pixelFontLoaded = document.fonts.check(fontSpec);
      return pixelFontLoaded;
    })
    .catch(() => {
      pixelFontLoaded = false;
      return false;
    });

  return pixelFontPromise;
}

export function pixelFontFamily(): string {
  void loadPixelFont();
  return pixelFontLoaded ? `${PIXEL_FONT}, monospace` : 'monospace';
}
