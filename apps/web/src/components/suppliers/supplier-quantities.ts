export type CartonPieces = { cartons: string; pieces: string };
const whole = /^(?:0|[1-9]\d{0,11})$/;
const decimal = /^(?:0|[1-9]\d{0,11})(?:\.\d{1,6})?$/;
const maximum = 999999999999n;

/** Exact operational conversion. A carton always uses this product's own factor. */
export function toBaseQuantity(value: CartonPieces, factor: number): string | null {
  if (!Number.isSafeInteger(factor) || factor < 1 || !whole.test(value.cartons) || !whole.test(value.pieces)) return null;
  const result = BigInt(value.cartons) * BigInt(factor) + BigInt(value.pieces);
  return result <= maximum ? result.toString() : null;
}

export function fromRecordedQuantity(value: string, unit: "BASE" | "CARTON", factor: number): CartonPieces | null {
  if (!Number.isSafeInteger(factor) || factor < 1 || !decimal.test(value)) return null;
  const [integer, fraction = ""] = value.split(".");
  const scale = 10n ** BigInt(fraction.length);
  const numerator = BigInt(integer! + fraction) * (unit === "CARTON" ? BigInt(factor) : 1n);
  if (numerator % scale !== 0n) return null;
  const base = numerator / scale;
  if (base > maximum) return null;
  return { cartons: (base / BigInt(factor)).toString(), pieces: (base % BigInt(factor)).toString() };
}

/** Six-decimal exact summary of the bounded document, never inventory arithmetic. */
export function decimalSum(values: string[]): string | null {
  let sum = 0n;
  for (const value of values) {
    if (!decimal.test(value)) return null;
    const [integer, fraction = ""] = value.split(".");
    sum += BigInt(integer!) * 1000000n + BigInt(fraction.padEnd(6, "0"));
  }
  const fraction = (sum % 1000000n).toString().padStart(6, "0").replace(/0+$/, "");
  return `${sum / 1000000n}${fraction ? "." + fraction : ""}`;
}

export function receiptQuantityError(expected: string, accepted: string, held: string, rejected: string, reason: string): boolean {
  if (![expected, accepted, held, rejected].every(value => decimal.test(value))) return true;
  const total = decimalSum([accepted, held, rejected]);
  const compare = (value: string) => { const [integer, fraction = ""] = value.split("."); return BigInt(integer!) * 1000000n + BigInt(fraction.padEnd(6, "0")); };
  return compare(expected) === 0n || total === null || compare(total) > compare(expected)
    || ((compare(held) > 0n || compare(rejected) > 0n) && reason.trim().length < 3);
}
