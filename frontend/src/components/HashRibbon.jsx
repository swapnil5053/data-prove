import { useState } from 'react';
import { Icon } from './icons';
import './HashRibbon.css';

/**
 * ─── The hash ribbon ─────────────────────────────────────────────────────────
 *
 * The signature element. A SHA-256 shown at full weight is never truncated into
 * a pill here -- it is a full-width monospace band, 4-character groups, two rows
 * of eight, on a hairline rule.
 *
 * The reasoning: the hash *is* the product. Every other page in this app exists
 * to answer "does this value match?", so hiding the value behind an ellipsis and
 * a copy button treats the answer as an implementation detail. Making it the
 * typographic hero is the one place this design spends boldness; everything
 * around it is deliberately quiet so it has room to land.
 *
 * Grouping in fours is not decoration either. It is how anyone actually compares
 * two hashes by eye: you check the first group, the last, and a couple in the
 * middle. There were numeric indices above every fourth group as well, to make
 * that comparison sayable out loud -- they were removed because they read as
 * stray numbers floating over the digest, which cost more than the addressing
 * gained.
 *
 * Truncation (first6…last6) is for dense table cells only, and lives in
 * .hash-truncated, not here.
 */

const GROUP = 4;
const PER_ROW = 8;

/** "a1b2…" -> ["a1b2", "c3d4", …]; 64 hex chars give exactly 16 groups. */
function group(value) {
  const out = [];
  for (let i = 0; i < value.length; i += GROUP) out.push(value.slice(i, i + GROUP));
  return out;
}

/**
 * @param {object} props
 * @param {string} props.value        the full hex digest
 * @param {string} [props.label]      eyebrow above the ribbon
 * @param {boolean} [props.copyable]  show the copy affordance
 * @param {(msg: string) => void} [props.announce]
 *        Called with a message for the live region on copy. A visual tick alone
 *        is invisible to a screen reader, so the caller routes this to the
 *        polite region rather than the ribbon owning one.
 */
export default function HashRibbon({ value, label = 'SHA-256', copyable = true, announce }) {
  const [copied, setCopied] = useState(false);

  if (!value) return null;

  const groups = group(value);
  const rows = [];
  for (let i = 0; i < groups.length; i += PER_ROW) {
    rows.push(groups.slice(i, i + PER_ROW));
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      announce?.(`${label} copied to clipboard.`);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard is blocked on insecure origins and in some embedded webviews.
      // The value is fully selectable on screen precisely so this is survivable.
      announce?.('Copy failed. The full value is shown and can be selected.');
    }
  };

  return (
    <figure className="ribbon">
      <figcaption className="ribbon-head">
        <span className="ribbon-label">{label}</span>
        {copyable && (
          <button
            type="button"
            className="btn btn-ghost btn-sm ribbon-copy"
            onClick={copy}
            aria-label={`Copy ${label} to clipboard`}
          >
            <Icon name={copied ? 'check' : 'copy'} size={14} />
            {copied ? 'Copied' : 'Copy'}
          </button>
        )}
      </figcaption>

      {/*
        The grouped rendering is decorative markup around a value that must stay
        one selectable, copyable string. Selecting the ribbon and pasting it has
        to yield the digest, not "a1b2 c3d4 …", so the real value sits in a
        visually-hidden span and the groups are aria-hidden.
      */}
      <span className="sr-only">{value}</span>

      <div className="ribbon-rows" aria-hidden="true">
        {rows.map((row, r) => (
          <div className="ribbon-row" key={r}>
            {row.map((g, i) => {
              const index = r * PER_ROW + i;
              return (
                <span className="ribbon-group" key={index}>
                  <span className="ribbon-chars">{g}</span>
                </span>
              );
            })}
          </div>
        ))}
      </div>
    </figure>
  );
}
