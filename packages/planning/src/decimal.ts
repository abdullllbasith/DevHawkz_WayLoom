/** Exact decimal strings in the planning units. No silent rounding toward a passing result. */

export function addDecimal(left: string, right: string): string {
  const scale = Math.max(fractionLength(left), fractionLength(right));
  return fromScaled(scaled(left, scale) + scaled(right, scale), scale);
}

export function multiplyDecimal(value: string, times: number): string {
  let total = "0";
  for (let index = 0; index < times; index += 1) total = addDecimal(total, value);
  return total;
}

export function compareDecimal(left: string, right: string): number {
  const scale = Math.max(fractionLength(left), fractionLength(right));
  const a = scaled(left, scale);
  const b = scaled(right, scale);
  return a < b ? -1 : a > b ? 1 : 0;
}

export function divideDecimalCeil(numerator: string, denominator: string): string {
  const resultScale = 6;
  const denScale = fractionLength(denominator);
  const scaledNumerator = scaled(numerator, resultScale) * 10n ** BigInt(denScale);
  const scaledDenominator = scaled(denominator, denScale);
  const quotient = scaledNumerator / scaledDenominator;
  const remainder = scaledNumerator % scaledDenominator;
  return fromScaled(remainder === 0n ? quotient : quotient + 1n, resultScale);
}

function fractionLength(value: string): number {
  return value.split(".")[1]?.length ?? 0;
}

function scaled(value: string, scale: number): bigint {
  const [whole, fraction = ""] = value.split(".");
  return BigInt((whole ?? "0") + fraction.padEnd(scale, "0"));
}

function fromScaled(value: bigint, scale: number): string {
  const negative = value < 0n;
  const digits = (negative ? -value : value).toString().padStart(scale + 1, "0");
  const whole = digits.slice(0, digits.length - scale);
  const fraction = digits.slice(digits.length - scale).replace(/0+$/, "");
  const text = fraction.length === 0 ? whole : `${whole}.${fraction}`;
  return negative ? `-${text}` : text;
}
