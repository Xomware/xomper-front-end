import { animate, style, transition, trigger } from '@angular/animations'

/**
 * Modal panel enter/leave.
 *
 * This used to animate `top`/`left`/`width`/`height` from the clicked card's
 * bounding rect, applied to the component HOST via @HostBinding. The host is
 * an undecorated element sitting in normal document flow -- the fixed
 * positioning lives on the panel inside it -- so those coordinates landed on
 * the wrong element and the modal opened wherever the host happened to sit in
 * the page, typically below what the reader was looking at.
 *
 * Scale and fade on the panel itself instead. No coordinates to get wrong,
 * and it reads the same.
 */
export const zoomModalAnimation = trigger('zoomAnimation', [
  transition(':enter', [
    style({ opacity: 0, transform: 'translate(-50%, -50%) scale(0.96)' }),
    animate('180ms ease-out', style({ opacity: 1, transform: 'translate(-50%, -50%) scale(1)' })),
  ]),
  transition(':leave', [
    animate('140ms ease-in', style({ opacity: 0, transform: 'translate(-50%, -50%) scale(0.98)' })),
  ]),
])
