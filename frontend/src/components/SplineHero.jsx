import { useEffect, useRef, useState } from 'react';
import './SplineHero.css';

/**
 * ─── Spline hero scene ───────────────────────────────────────────────────────
 *
 * A hosted WebGL scene in the hero. It is decorative: it carries no information
 * the page does not state in text, and nothing depends on it having loaded.
 *
 * It is also, by a wide margin, the most expensive thing in this app -- a Spline
 * scene plus its runtime is measured in megabytes against a 200KB budget. That
 * is a deliberate product decision, not an oversight, so the cost is contained
 * as tightly as it can be without removing it:
 *
 *   - Nothing loads until the frame is actually near the viewport. The iframe
 *     src is not set at mount, so first paint never waits on it and a visitor
 *     who bounces above the fold pays nothing.
 *   - It does not load at all under prefers-reduced-motion. The scene animates
 *     continuously; someone who has asked the OS to stop animation gets the
 *     static poster and no WebGL context.
 *   - It does not load on a metered or 2g/3g connection, where several MB of
 *     decoration is indefensible.
 *   - A poster renders in its place in every one of those cases, so the layout
 *     is identical whether or not the scene ever arrives. No shift.
 *   - aria-hidden, and never focusable. A screen reader gets nothing from a
 *     WebGL canvas, so announcing it as a frame is noise, not access.
 *
 * The aspect ratio is fixed in CSS rather than left to the iframe, because an
 * iframe with no intrinsic size collapses to 150px and then jumps when content
 * arrives.
 */

const SCENE_URL =
  'https://my.spline.design/interactiveaiwebsite-n8GHWrwREFx7okdJwKBrY1Cm/';

/** Reasons we may decline to load, kept explicit so the poster can explain itself. */
function shouldSkip() {
  if (typeof window === 'undefined') return 'ssr';
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return 'reduced-motion';
  const conn = navigator.connection;
  if (conn?.saveData) return 'save-data';
  if (conn?.effectiveType && /(^|-)2g$|^3g$/.test(conn.effectiveType)) return 'slow-network';
  return null;
}

export default function SplineHero() {
  const frameRef = useRef(null);
  const [src, setSrc] = useState(null);
  const [ready, setReady] = useState(false);
  const [skipped] = useState(shouldSkip);

  useEffect(() => {
    if (skipped) return;

    const el = frameRef.current;
    if (!el) return;

    // rootMargin starts the fetch just before it is needed, so the scene is
    // usually there by the time it scrolls in, without competing with the
    // critical path at load.
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setSrc(SCENE_URL);
          io.disconnect();
        }
      },
      { rootMargin: '200px' },
    );

    io.observe(el);
    return () => io.disconnect();
  }, [skipped]);

  return (
    <div className="spline-hero" ref={frameRef} aria-hidden="true">
      {/* Always rendered, underneath. It is what you see before the scene
          arrives, and permanently if it never does. */}
      <div className={`spline-poster${ready ? ' is-hidden' : ''}`}>
        <svg viewBox="0 0 200 200" role="presentation" focusable="false">
          <circle className="spline-poster-ring" cx="100" cy="100" r="72" />
          <circle className="spline-poster-ring" cx="100" cy="100" r="52" />
          <circle className="spline-poster-dot" cx="100" cy="100" r="3.5" />
          {/* Tick marks: a bezel, which is the same instrument language the
              rest of the page uses. */}
          {Array.from({ length: 24 }, (_, i) => {
            const a = (i / 24) * Math.PI * 2;
            const long = i % 6 === 0;
            const r1 = long ? 78 : 82;
            return (
              <line
                key={i}
                className={long ? 'spline-tick-major' : 'spline-tick'}
                x1={100 + Math.cos(a) * r1}
                y1={100 + Math.sin(a) * r1}
                x2={100 + Math.cos(a) * 88}
                y2={100 + Math.sin(a) * 88}
              />
            );
          })}
        </svg>
      </div>

      {src && (
        <iframe
          className={`spline-frame${ready ? ' is-ready' : ''}`}
          src={src}
          title=""
          tabIndex={-1}
          loading="lazy"
          onLoad={() => setReady(true)}
          // No allow-scripts escape hatches beyond what the scene needs to run.
          sandbox="allow-scripts allow-same-origin"
          referrerPolicy="no-referrer"
        />
      )}
    </div>
  );
}
