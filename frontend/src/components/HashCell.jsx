import { useState } from 'react';
import { Icon } from './icons';

/**
 * ─── Hash cell ───────────────────────────────────────────────────────────────
 *
 * Dense-context hash display: first 6 / last 4 of a hex digest, never the
 * full 64 characters, so it never overflows a card or table cell the way an
 * un-truncated hash does. The full value stays reachable three ways: the
 * native `title` tooltip, a visually-hidden `sr-only` span for assistive tech
 * and copy/paste, and the optional copy button.
 *
 * Not the ribbon: `HashRibbon` is the signature, full-weight presentation for
 * the one or two places a hash is the point of the screen. This is for
 * everywhere else a hash is one field among several.
 *
 * @param {object} props
 * @param {string} props.value
 * @param {boolean} [props.copyable]
 * @param {(msg: string) => void} [props.announce]
 *        Same contract as HashRibbon's `announce`. The icon swap (copy/check)
 *        is a purely visual cue; an icon-only button has no visible "Copied"
 *        text the way HashRibbon's labeled button does, so without a live
 *        region a screen reader user gets no confirmation the copy worked.
 */
export default function HashCell({ value, copyable = false, announce }) {
  const [copied, setCopied] = useState(false);

  if (!value) return null;

  const short = value.length > 12 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value;

  const copy = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      announce?.('Hash copied to clipboard.');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard is blocked on insecure origins and in some embedded webviews.
      // The full value is still selectable via the visible truncated text's
      // title tooltip and the sr-only span, so this is survivable.
      announce?.('Copy failed. The full value is shown on hover and reachable by screen readers.');
    }
  };

  return (
    <span className="hash-cell" title={value}>
      <span className="hash-truncated">{short}</span>
      <span className="sr-only">{value}</span>
      {copyable && (
        <button
          type="button"
          className="btn btn-ghost btn-icon hash-cell-copy"
          onClick={copy}
          aria-label="Copy hash to clipboard"
        >
          <Icon name={copied ? 'check' : 'copy'} size={13} />
        </button>
      )}
    </span>
  );
}
