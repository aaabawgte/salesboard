import { describe, expect, it, vi } from 'vitest';
import { withViewTransition } from '../src/lib/motion';

describe('view transition helper', () => {
  it('applies the update directly when the View Transitions API is unavailable', () => {
    const update = vi.fn();
    withViewTransition(update, 'page');
    expect(update).toHaveBeenCalledTimes(1);
  });
});
