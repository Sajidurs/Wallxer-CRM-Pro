/**
 * Taka, stored as integer poisha.
 *
 * Nothing here ever holds an amount in a float. `0.1 + 0.2` is `0.30000000000000004`,
 * and a ledger that disagrees with itself by a poisha per row is worse than one
 * that is tedious to enter. Amounts cross the wire as integers and become
 * decimal only at the moment they are drawn.
 */

export const CURRENCY_SYMBOL = "৳";

/**
 * Bangladesh groups digits the South Asian way — 1,00,00,000 is one crore, not
 * ten million. `en-BD` returns Western grouping and the string "BDT"; `bn-BD`
 * returns Bengali digits. `en-IN` is the only locale that gives the grouping
 * this audience reads, so the symbol is applied by hand.
 */
const DECIMAL = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const WHOLE = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 0,
});

/** `৳12,34,567.89`. */
export function formatPoisha(poisha: number): string {
  const sign = poisha < 0 ? "-" : "";
  return `${sign}${CURRENCY_SYMBOL}${DECIMAL.format(Math.abs(poisha) / 100)}`;
}

/** `৳12,34,568` — for tables and totals, where the paisa is noise. */
export function formatTakaWhole(poisha: number): string {
  const sign = poisha < 0 ? "-" : "";
  return `${sign}${CURRENCY_SYMBOL}${WHOLE.format(Math.round(Math.abs(poisha) / 100))}`;
}

/**
 * `৳1.2Cr`, `৳12.3L`, `৳45K` — for chart axes, where a full amount would
 * collide with its neighbour. Crore and lakh rather than M and K, because that
 * is how the number is read aloud here.
 */
export function formatPoishaCompact(poisha: number): string {
  const sign = poisha < 0 ? "-" : "";
  const taka = Math.abs(poisha) / 100;

  const scaled =
    taka >= 10_000_000
      ? `${trim(taka / 10_000_000)}Cr`
      : taka >= 100_000
        ? `${trim(taka / 100_000)}L`
        : taka >= 1_000
          ? `${trim(taka / 1_000)}K`
          : String(Math.round(taka));

  return `${sign}${CURRENCY_SYMBOL}${scaled}`;
}

/** One decimal place, but never a trailing `.0`. */
function trim(value: number): string {
  return value.toFixed(1).replace(/\.0$/, "");
}

/**
 * "1,234.56", "৳1234.5" and "1234" all become poisha. Returns null for
 * anything that is not a number, so the caller can say so rather than storing
 * a NaN.
 *
 * Multiplying by 100 in floating point then rounding is safe at these
 * magnitudes: 1234.56 * 100 is 123455.99999999999, and rounding lands it back
 * on 123456. The check constraint caps the input well below the point where
 * that stops being true.
 */
export function parseTakaToPoisha(input: string): number | null {
  const cleaned = input
    .replace(new RegExp(CURRENCY_SYMBOL, "g"), "")
    .replace(/[,\s]/g, "")
    .trim();

  if (cleaned === "" || !/^\d*\.?\d*$/.test(cleaned)) return null;

  const taka = Number(cleaned);
  if (!Number.isFinite(taka)) return null;

  return Math.round(taka * 100);
}

/** The editable form of a stored amount: `1234.56`, no symbol, no grouping. */
export function poishaToInput(poisha: number): string {
  return (poisha / 100).toFixed(2);
}
