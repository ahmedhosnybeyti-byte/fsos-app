import { Injectable } from "@nestjs/common";
import type { EntityRecord } from "../rie/entity-provider.interface";
import { CATALOG_FAMILY_REGISTRY, CATALOG_FIT_VERSION, RETAIL_OUTLET_TYPES, type CatalogFamily } from "./catalog-fit-taxonomy";
import type { ProductFitOutput } from "./product-fit.service";

const norm = (value: unknown) => String(value ?? "").trim().toLowerCase();
const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : Number(value) || 0;
const isActive = (product: EntityRecord) => { const status = norm(product.ProductStatus ?? product.Status); return status === "" || status === "active"; };
type Tier = "PREMIUM" | "MID_MARKET" | "VALUE";

@Injectable()
export class CatalogFitService {
  build(input: { productFit: ProductFitOutput; products: readonly EntityRecord[]; businessType: string | null; businessClassification: unknown }) {
    const activeProducts = input.products.filter(isActive);
    const businessType = norm(input.businessType);
    const retailFamilies = this.retailFamilies(businessType, activeProducts);
    if (RETAIL_OUTLET_TYPES.has(businessType) && retailFamilies.length === 0) return this.unavailable(input, activeProducts, "No configured company catalog-family mapping matches this retail outlet.");

    const needs = input.productFit.confirmedNeedTags;
    const candidates = input.productFit.candidates;
    const matchedNeeds = new Set(candidates.map((candidate) => candidate.likelyNeed));
    const coverage = needs.length ? { score: (matchedNeeds.size / needs.length) * 100, confidence: 1 } : null;
    const semanticCandidates = candidates.filter((candidate) => candidate.matchQuality === "CATEGORY" || candidate.matchQuality === "PRODUCT_TEXT");
    const semantic = semanticCandidates.length ? { score: semanticCandidates.reduce((sum, candidate) => sum + (candidate.matchQuality === "CATEGORY" ? 100 : 60), 0) / semanticCandidates.length, confidence: needs.length ? Math.min(1, matchedNeeds.size / needs.length) : 0 } : null;
    const peerCandidates = candidates.filter((candidate) => candidate.peerSignals.peerScope !== "NONE");
    const peer = peerCandidates.length ? this.peerComponent(peerCandidates) : null;
    const tier = this.tierComponent(candidates, input.businessClassification);
    const weighted = [[coverage, 45], [semantic, 25], [peer, 20], [tier, 10]] as const;
    const available = weighted.filter(([component]) => component !== null);
    const score = available.length ? available.reduce((sum, [component, weight]) => sum + component!.score * weight, 0) / available.reduce((sum, [, weight]) => sum + weight, 0) : null;
    const confidence = weighted.reduce((sum, [component, weight]) => sum + weight * (component?.confidence ?? 0), 0);
    const catalogFingerprint = JSON.stringify({ v: CATALOG_FIT_VERSION, needs, candidates: candidates.map((candidate) => ({ code: candidate.productCode, need: candidate.likelyNeed, match: candidate.matchQuality, peer: candidate.peerSignals, tier: candidate.productTier })), tier: input.businessClassification, catalog: activeProducts.map((product) => [product.ProductCode, product.Category, product.ProductName, product.Brand]).sort(), retailFamilies });
    return { catalogFitScore: score === null ? null : Math.round(score), catalogFitConfidence: Math.round(confidence), catalogFitVersion: CATALOG_FIT_VERSION, components: { coverage, semantic, peer, tier }, reasons: [...(coverage ? [`${matchedNeeds.size}/${needs.length} confirmed needs have active candidates.`] : ["No confirmed need tags available."]), ...(retailFamilies.length ? [`Configured retail families: ${retailFamilies.join(", ")}.`] : [])], catalogFingerprint };
  }

  private unavailable(input: { productFit: ProductFitOutput; businessClassification: unknown }, products: readonly EntityRecord[], reason: string) {
    return { catalogFitScore: null, catalogFitConfidence: 0, catalogFitVersion: CATALOG_FIT_VERSION, components: { coverage: null, semantic: null, peer: null, tier: null }, reasons: [reason], catalogFingerprint: JSON.stringify({ v: CATALOG_FIT_VERSION, needs: input.productFit.confirmedNeedTags, tier: input.businessClassification, catalog: products.map((product) => [product.ProductCode, product.Category, product.ProductName, product.Brand]).sort() }) };
  }

  private retailFamilies(businessType: string, products: readonly EntityRecord[]): CatalogFamily[] {
    const categories = new Set(products.map((product) => norm(product.Category)));
    return CATALOG_FAMILY_REGISTRY.filter((family) => family.outletTypes.includes(businessType) && family.companyCategories.some((category) => categories.has(norm(category)))).map((family) => family.family);
  }

  private peerComponent(candidates: ProductFitOutput["candidates"]) {
    const maxBuyers = Math.max(...candidates.map((candidate) => candidate.peerSignals.buyerCount), 0);
    const maxValue = Math.max(...candidates.map((candidate) => candidate.peerSignals.orderValue), 0);
    const withSales = candidates.filter((candidate) => candidate.peerSignals.buyerCount > 0 || candidate.peerSignals.orderValue > 0);
    return { score: withSales.length && (maxBuyers || maxValue) ? withSales.reduce((sum, candidate) => sum + ((maxBuyers ? candidate.peerSignals.buyerCount / maxBuyers : 0) + (maxValue ? candidate.peerSignals.orderValue / maxValue : 0)) * 50, 0) / withSales.length : 0, confidence: candidates.length ? withSales.length / candidates.length : 0 };
  }

  private tierComponent(candidates: ProductFitOutput["candidates"], classification: unknown) {
    const data = classification && typeof classification === "object" ? classification as { tier?: unknown; tierConfidence?: unknown } : {};
    const tier = data.tier === "PREMIUM" || data.tier === "MID_MARKET" || data.tier === "VALUE" ? data.tier as Tier : null;
    const confidence = Math.max(0, Math.min(1, number(data.tierConfidence) / 100));
    const known = candidates.filter((candidate) => candidate.productTier !== null);
    if (!tier || confidence === 0 || !known.length) return null;
    return { score: known.filter((candidate) => candidate.productTier === tier).length / known.length * 100, confidence: confidence * (known.length / candidates.length) };
  }
}
