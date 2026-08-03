import { strict as assert } from "node:assert";
import test from "node:test";
import { calculateSuggestedLoading } from "./suggested-loading";

test("subtracts a positive available vehicle balance", () => assert.deepEqual(calculateSuggestedLoading({ weeklyAverageSales: 10, confirmedOrders: 2, safetyStock: 1, vehicleStock: 5 }), { grossSuggestedQuantity: 13, suggestedQuantity: 8, isPreliminary: false }));
test("keeps zero as an available vehicle balance", () => assert.deepEqual(calculateSuggestedLoading({ weeklyAverageSales: 10, confirmedOrders: 0, safetyStock: 0, vehicleStock: 0 }), { grossSuggestedQuantity: 10, suggestedQuantity: 10, isPreliminary: false }));
test("keeps the gross need preliminary when vehicle stock is unavailable", () => assert.deepEqual(calculateSuggestedLoading({ weeklyAverageSales: 10, confirmedOrders: 2, safetyStock: 1, vehicleStock: null }), { grossSuggestedQuantity: 13, suggestedQuantity: 13, isPreliminary: true }));
test("recalculates after a manual vehicle balance and never returns a negative quantity", () => assert.deepEqual(calculateSuggestedLoading({ weeklyAverageSales: 4, confirmedOrders: 0, safetyStock: 0, vehicleStock: 8 }), { grossSuggestedQuantity: 4, suggestedQuantity: 0, isPreliminary: false }));