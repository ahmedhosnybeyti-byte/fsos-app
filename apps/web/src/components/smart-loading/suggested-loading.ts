export function calculateSuggestedLoading(input: {
  weeklyAverageSales: number;
  confirmedOrders: number;
  safetyStock: number;
  vehicleStock: number | null;
}): { grossSuggestedQuantity: number; suggestedQuantity: number; isPreliminary: boolean } {
  const grossSuggestedQuantity = Math.max(0, input.weeklyAverageSales + input.confirmedOrders + input.safetyStock);
  if (input.vehicleStock === null) return { grossSuggestedQuantity, suggestedQuantity: grossSuggestedQuantity, isPreliminary: true };
  return { grossSuggestedQuantity, suggestedQuantity: Math.max(0, grossSuggestedQuantity - input.vehicleStock), isPreliminary: false };
}