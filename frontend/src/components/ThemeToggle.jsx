import { useEffect, useState } from 'react';
import { Icon } from './icons';

/**
 * ─── Theme toggle ────────────────────────────────────────────────────────────
 *
 * The inline script in index.html has already resolved and applied a theme
 * before first paint, so this component's only job is to let the user override
 * it and to remember that they did.
 *
 * It reads the attribute the script set rather than recomputing from
 * localStorage. Two sources deciding the same thing is how a flash of the wrong
 * theme gets reintroduced, and the DOM is the one that is definitely correct by
 * the time React mounts.
 *
 * A manual choice is sticky. Once someone has said "dark", following the OS
 * afterwards would override a deliberate decision, so the OS listener only
 * applies while no preference is stored.
 */

const KEY = 'dataprove:theme';

function current() {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState(current);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e) => {
      let stored = null;
      try { stored = localStorage.getItem(KEY); } catch { /* private mode */ }
      if (!stored) setTheme(e.matches ? 'dark' : 'light');
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    try { localStorage.setItem(KEY, next); } catch { /* private mode: this session only */ }
  };

  const nextLabel = theme === 'dark' ? 'light' : 'dark';

  return (
    <button
      type="button"
      className="btn btn-ghost btn-icon"
      onClick={toggle}
      aria-label={`Switch to ${nextLabel} theme`}
      title={`Switch to ${nextLabel} theme`}
    >
      <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} />
    </button>
  );
}
