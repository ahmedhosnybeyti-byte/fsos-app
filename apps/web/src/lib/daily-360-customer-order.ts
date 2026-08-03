export interface Daily360CustomerOrderValues {
  customerName: string;
  itemsCount: number;
  suggestedQuantity: number;
}

/**
 * Returns a newly sorted customer list for every Daily 360 consumer. Keeping
 * the priority here makes the modal and PDF use the exact same ordering while
 * leaving the source groups untouched.
 */
export function sortDaily360Customers<T>(
  customers: readonly T[],
  valuesOf: (customer: T) => Daily360CustomerOrderValues,
): T[] {
  return [...customers].sort((a, b) => {
    const aValues = valuesOf(a);
    const bValues = valuesOf(b);
    return (
      bValues.itemsCount - aValues.itemsCount
      || bValues.suggestedQuantity - aValues.suggestedQuantity
      || aValues.customerName.localeCompare(bValues.customerName, "ar")
    );
  });
}
