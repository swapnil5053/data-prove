/**
 * ─── Icons ───────────────────────────────────────────────────────────────────
 *
 * Hand-rolled, 14 of them, replacing 40 emoji. No icon library: a dependency
 * that ships a thousand glyphs to render fourteen is not worth the bytes or the
 * supply chain, and a hand-rolled set can share one stroke weight with the rest
 * of the interface.
 *
 * House rules, applied by <Icon> so no call site can drift:
 *   20x20 viewBox, stroke="currentColor", stroke-width 1.5, fill="none",
 *   round caps and joins.
 *
 * Accessibility is not optional here and is why this wrapper exists rather than
 * bare <svg> tags. An icon is decorative by default and gets aria-hidden, so
 * screen readers skip it instead of announcing "image". Pass a `title` only when
 * the icon carries meaning nothing else on screen conveys -- and then it gets
 * role="img" and a real accessible name.
 *
 * The emoji this replaces were worse than ugly. A screen reader announces the
 * white heavy check mark as "white heavy check mark", the police car light as
 * "police car light", and renders differently on every platform, so "verified"
 * looked like a different product depending on the machine.
 */

const BASE = {
  width: 20,
  height: 20,
  viewBox: '0 0 20 20',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

/**
 * @param {{ name: keyof typeof paths, title?: string, size?: number }} props
 */
export function Icon({ name, title, size, ...rest }) {
  const draw = paths[name];
  if (!draw) throw new Error(`Unknown icon: ${name}`);

  const a11y = title
    ? { role: 'img', 'aria-label': title }
    : { 'aria-hidden': 'true', focusable: 'false' };

  return (
    <svg {...BASE} {...(size ? { width: size, height: size } : null)} {...a11y} {...rest}>
      {draw}
    </svg>
  );
}

const paths = {
  check: <polyline points="4,10.5 8,14.5 16,5.5" />,

  x: <><line x1="5" y1="5" x2="15" y2="15" /><line x1="15" y1="5" x2="5" y2="15" /></>,

  'alert-triangle': (
    <>
      <path d="M10 2.75 18.25 17H1.75L10 2.75Z" />
      <line x1="10" y1="8" x2="10" y2="11.5" />
      <line x1="10" y1="14" x2="10" y2="14.01" />
    </>
  ),

  clock: <><circle cx="10" cy="10" r="7.25" /><polyline points="10,5.5 10,10 13,11.75" /></>,

  copy: (
    <>
      <rect x="7" y="7" width="9.5" height="9.5" rx="1.5" />
      <path d="M13 4.5H5a1.5 1.5 0 0 0-1.5 1.5v8" />
    </>
  ),

  'external-link': (
    <>
      <path d="M15.5 11.5v3.5a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5V6A1.5 1.5 0 0 1 5 4.5h3.5" />
      <polyline points="12,3.5 16.5,3.5 16.5,8" />
      <line x1="8.5" y1="11.5" x2="16.5" y2="3.5" />
    </>
  ),

  upload: (
    <>
      <path d="M3.5 12.5V15a1.5 1.5 0 0 0 1.5 1.5h10a1.5 1.5 0 0 0 1.5-1.5v-2.5" />
      <polyline points="6.5,7 10,3.5 13.5,7" />
      <line x1="10" y1="3.5" x2="10" y2="12.5" />
    </>
  ),

  search: <><circle cx="8.75" cy="8.75" r="5.25" /><line x1="12.75" y1="12.75" x2="16.5" y2="16.5" /></>,

  wallet: (
    <>
      <rect x="2.5" y="5" width="15" height="11" rx="1.75" />
      <path d="M2.5 8.5h15" />
      <circle cx="14" cy="12.5" r=".9" />
    </>
  ),

  link: (
    <>
      <path d="M8.5 11.5a3 3 0 0 0 4.24 0l2.5-2.5a3 3 0 1 0-4.24-4.24l-1 1" />
      <path d="M11.5 8.5a3 3 0 0 0-4.24 0l-2.5 2.5a3 3 0 1 0 4.24 4.24l1-1" />
    </>
  ),

  file: (
    <>
      <path d="M11.5 2.5H6A1.5 1.5 0 0 0 4.5 4v12A1.5 1.5 0 0 0 6 17.5h8a1.5 1.5 0 0 0 1.5-1.5V6.5l-4-4Z" />
      <polyline points="11.5,2.5 11.5,6.5 15.5,6.5" />
    </>
  ),

  'chevron-down': <polyline points="5,8 10,13 15,8" />,

  'chevron-right': <polyline points="8,5 13,10 8,15" />,

  /* Static geometry. The rotation is a CSS animation on .spinner, so
     prefers-reduced-motion stops it along with everything else. */
  loader: <><circle cx="10" cy="10" r="7.25" opacity=".25" /><path d="M17.25 10A7.25 7.25 0 0 0 10 2.75" /></>,

  // Two beyond the fourteen the interface needs, for the theme toggle. The
  // button shows the theme it switches *to*, so both are always reachable.
  sun: (
    <>
      <circle cx="10" cy="10" r="3.5" />
      <path d="M10 1.75v1.5M10 16.75v1.5M1.75 10h1.5M16.75 10h1.5M4.2 4.2l1.06 1.06M14.74 14.74l1.06 1.06M15.8 4.2l-1.06 1.06M5.26 14.74L4.2 15.8" />
    </>
  ),

  moon: <path d="M16.5 11.4A7 7 0 0 1 8.6 3.5a7 7 0 1 0 7.9 7.9Z" />,
};

export const iconNames = Object.keys(paths);
