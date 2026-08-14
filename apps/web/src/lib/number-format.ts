const wholeNumberFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const percentageFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});

/** Presentation-only formatting for Customer 360 monetary and large values. */
export function formatWholeNumber(value: number): string {
  return wholeNumberFormatter.format(value);
}

export function formatPercentage(value: number): string {
  return percentageFormatter.format(value);
}


/** Formats numeric fragments from measured server-authored Customer 360 text. */
export function formatDynamicNumbers(text: string): string {
  return text.replace(/(?<![\d-])-?\d[\d,]*(?:\.\d+)?/g, (fragment) => formatWholeNumber(Number(fragment.replace(/,/g, ""))));
}
