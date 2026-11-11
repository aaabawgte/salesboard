import { flushSync } from 'react-dom';

// Names the kind of state change so styles.css can choreograph it via html[data-vt="…"].
export type TransitionKind = 'page' | 'profile-open' | 'profile-close' | 'theme' | 'login';

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => { finished: Promise<void> };
};

export function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

// Runs a React state update inside a View Transition when the browser supports it.
// Without support, with reduced motion, or in a hidden tab the update is applied directly,
// so nothing functional ever depends on the animation.
export function withViewTransition(update: () => void, kind: TransitionKind) {
  const doc = typeof document === 'undefined' ? null : document as ViewTransitionDocument;
  if (!doc?.startViewTransition || prefersReducedMotion() || doc.visibilityState === 'hidden') {
    update();
    return;
  }
  const root = doc.documentElement;
  root.dataset.vt = kind;
  const transition = doc.startViewTransition(() => flushSync(update));
  transition.finished.finally(() => {
    if (root.dataset.vt === kind) delete root.dataset.vt;
  });
}
