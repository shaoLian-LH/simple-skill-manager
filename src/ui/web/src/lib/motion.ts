function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function animateRouteSwap(element: HTMLElement): void {
  if (prefersReducedMotion()) {
    return;
  }

  element.animate(
    [
      { opacity: 0.62, transform: 'translateY(14px)' },
      { opacity: 1, transform: 'translateY(0px)' },
    ],
    { duration: 260, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'both' },
  );
}

export function pulseUpdate(element: HTMLElement): void {
  if (prefersReducedMotion()) {
    return;
  }

  element.animate(
    [
      { boxShadow: '0 0 0 rgba(59, 130, 246, 0)' },
      { boxShadow: '0 0 0 8px rgba(59, 130, 246, 0.16)' },
      { boxShadow: '0 0 0 rgba(59, 130, 246, 0)' },
    ],
    { duration: 420, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
  );
}
