import { animate } from 'motion';

export function animateRouteSwap(element: HTMLElement): void {
  animate(
    element,
    { opacity: [0.72, 1], y: [10, 0] },
    { duration: 0.24 },
  );
}

export function pulseUpdate(element: HTMLElement): void {
  animate(
    element,
    {
      boxShadow: [
        '0 0 0 rgba(186, 106, 63, 0)',
        '0 0 0 8px rgba(186, 106, 63, 0.16)',
        '0 0 0 rgba(186, 106, 63, 0)',
      ],
    },
    { duration: 0.45 },
  );
}
