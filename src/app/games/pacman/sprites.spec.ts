import { drawFruitSprite, drawPacmanEye } from './sprites';
import type { FruitType } from './types';

describe('pacman sprites', () => {
  it('draws Pac-Man eye and pupil pixels', () => {
    const { ctx } = makeCanvas();

    drawPacmanEye(ctx, 16, 16, 'right', { radius: 5 });

    const eyeRegion = ctx.getImageData(12, 12, 5, 5).data;
    expect(countOpaquePixels(eyeRegion)).toBeGreaterThan(0);
  });

  it('draws every fruit sprite with visible pixels', () => {
    const fruits: FruitType[] = [
      'cherry',
      'strawberry',
      'orange',
      'apple',
      'melon',
      'galaxian',
      'bell',
      'key',
    ];

    for (const fruit of fruits) {
      const { ctx } = makeCanvas();
      drawFruitSprite(ctx, 16, 16, fruit, 8);
      const pixels = ctx.getImageData(8, 8, 16, 16).data;
      expect(countOpaquePixels(pixels)).withContext(fruit).toBeGreaterThan(0);
    }
  });
});

function makeCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  return { canvas, ctx };
}

function countOpaquePixels(data: Uint8ClampedArray): number {
  let count = 0;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] !== 0) count++;
  }
  return count;
}
