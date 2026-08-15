import { Injectable, NotFoundException } from "@nestjs/common";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { RieFacade } from "../rie/rie-facade.service";
import type { EntityRecord } from "../rie/entity-provider.interface";
import { MurshidakIntelligenceService } from "./murshidak-intelligence.service";
import { NEED_TAXONOMY, NEED_TAXONOMY_VERSION, type NeedDefinition } from "./need-taxonomy";
import { CatalogFitService } from "./catalog-fit.service";

export type Candidate = { productCode: string; productName: string; brand: string | null; category: string | null; priority: number; confidence: number; likelyNeed: string; matchQuality: "CATEGORY" | "PRODUCT_TEXT"; productTier: "PREMIUM" | "MID_MARKET" | "VALUE" | null; reasons: string[]; peerSignals: { buyerCount: number; orderValue: number; peerScope: "CUSTOMER_TYPE" | "HORECA_FALLBACK" | "CHANNEL" | "NONE" }; availability: "UNKNOWN" };
export type ProductFitOutput = { version: string; computedAt: string; inputFingerprint: string | null; confirmedNeedTags: string[]; candidates: Candidate[] };
const norm = (value: unknown) => String(value ?? "").trim().toLowerCase();
const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : Number(value) || 0;
const hasTerm = (value: unknown, terms: readonly string[]) => terms.some((term) => norm(value).includes(term));
const HORECA_TYPES = new Set(["hotel", "restaurant", "cafe", "coffee_shop", "bakery", "patisserie", "kitchen", "catering_service"]);

@Injectable()
export class ProductFitService {
  constructor(private readonly rie: RieFacade, private readonly intelligence: MurshidakIntelligenceService, private readonly catalogFit: CatalogFitService) {}
  private readonly companyData = new Map<string, { until: number; value: Promise<(readonly EntityRecord[])[]> }>();

  async build(user: AuthenticatedUser, prospectId: string) {
    const companyId = user.companyId!;
    const [profile, prospect] = await Promise.all([
      this.intelligence.profile(companyId, prospectId),
      this.intelligence.prospectFacts(companyId, prospectId),
    ]);
    if (!prospect) throw new NotFoundException();
    const baseNeeds = NEED_TAXONOMY.filter((need) => need.businessTypes.includes(norm(prospect.businessType)) && need.menuTags.length === 0).map((need) => need.tag);
    if (!profile) await this.intelligence.storeRulesInsights({ companyId, prospectId, inputFingerprint: `base-rules-v1:${prospect.businessType ?? ""}`, refreshAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), businessClassification: { businessType: prospect.businessType, source: "base-rules" }, menuServiceInsights: { version: "base-rules-v1", needTags: baseNeeds, source: "base-rules" } });
    const currentProfile = profile ?? await this.intelligence.profile(companyId, prospectId);
    if (!currentProfile) throw new NotFoundException();
    const needs = this.deriveNeeds(prospect.businessType, currentProfile.menuServiceInsights);
    const commercialTier = (currentProfile.businessClassification as { tier?: unknown } | null)?.tier;
    const ctx = { companyId, requestingUser: { roleCode: user.roleCode, email: user.email } };
    const [customers = [], invoices = [], items = [], products = []] = await this.companyRecords(companyId, ctx);
    const peer = this.peerSales(customers, invoices, items, prospect.businessType, prospect.channel);
    const candidates = this.matchProducts(products, needs, peer, commercialTier === "PREMIUM" || commercialTier === "MID_MARKET" || commercialTier === "VALUE" ? commercialTier : null).slice(0, 10);
    const productFit: ProductFitOutput = { version: NEED_TAXONOMY_VERSION, computedAt: new Date().toISOString(), inputFingerprint: currentProfile.inputFingerprint, confirmedNeedTags: needs.map((need) => need.tag), candidates };
    const output = { ...productFit, ...this.catalogFit.build({ productFit, products, businessType: prospect.businessType, businessClassification: currentProfile.businessClassification }) };
    await this.intelligence.storeProductFit(companyId, prospectId, output);
    return output;
  }

  private companyRecords(companyId: string, ctx: { companyId: string; requestingUser: { roleCode: string; email: string } }) {
    const cached = this.companyData.get(companyId);
    if (cached && cached.until > Date.now()) return cached.value;
    const value = Promise.all(["Customers", "Invoices", "Invoice Items", "Products"].map(async (entity) => {
      const result = await this.rie.getEntityRecords(entity, ctx);
      return result.available ? result.records : [];
    }));
    this.companyData.set(companyId, { until: Date.now() + 5 * 60 * 1000, value });
    return value;
  }

  private deriveNeeds(businessType: string | null, insights: unknown): NeedDefinition[] {
    const menuTags = Array.isArray((insights as { needTags?: unknown })?.needTags) ? (insights as { needTags: unknown[] }).needTags.map(norm) : [];
    return NEED_TAXONOMY.filter((need) => need.businessTypes.includes(norm(businessType)) && (need.menuTags.length === 0 || menuTags.includes(need.tag) || need.menuTags.some((tag) => menuTags.includes(tag))));
  }

  private peerSales(customers: readonly EntityRecord[], invoices: readonly EntityRecord[], items: readonly EntityRecord[], businessType: string | null, channel: string | null) {
    const typePeers = new Set(customers.filter((row) => norm(row.CustomerType) === norm(businessType) && norm(businessType) !== "").map((row) => norm(row.CustomerCode)));
    const channelPeers = new Set(customers.filter((row) => norm(row.Channel) === norm(channel) && norm(channel) !== "").map((row) => norm(row.CustomerCode)));
    const invoiceCustomers = new Map(invoices.map((row) => [norm(row.InvoiceNo), norm(row.CustomerCode)]));
    const salesFor = (peers: ReadonlySet<string>) => {
      const sales = new Map<string, { customers: Set<string>; value: number }>();
      for (const item of items) {
        const customer = invoiceCustomers.get(norm(item.InvoiceNo)); const code = norm(item.ProductCode);
        if (!customer || !code || !peers.has(customer)) continue;
        const entry = sales.get(code) ?? { customers: new Set<string>(), value: 0 };
        entry.customers.add(customer); entry.value += number(item.LineTotal); sales.set(code, entry);
      }
      return sales;
    };
    let sales = salesFor(typePeers.size > 0 ? typePeers : channelPeers);
    let scope: Candidate["peerSignals"]["peerScope"] = typePeers.size > 0 ? "CUSTOMER_TYPE" : channelPeers.size > 0 ? "CHANNEL" : "NONE";
    // All HoReCa profiles use their own type's buyers first. On missing
    // evidence, comparable local HoReCa buyers support the ranking rather
    // than inventing a recommendation from the complete catalogue.
    if (HORECA_TYPES.has(norm(businessType)) && sales.size === 0) {
      const comparableHorecaPeers = new Set(customers
        .filter((row) => HORECA_TYPES.has(norm(row.CustomerType)))
        .map((row) => norm(row.CustomerCode)));
      const comparableSales = salesFor(comparableHorecaPeers);
      if (comparableSales.size > 0) {
        sales = comparableSales;
        scope = "HORECA_FALLBACK";
      }
    }
    return { sales, scope };
  }

  private matchProducts(products: readonly EntityRecord[], needs: readonly NeedDefinition[], peer: ReturnType<ProductFitService["peerSales"]>, commercialTier: "PREMIUM" | "MID_MARKET" | "VALUE" | null): Candidate[] {
    const maxPeerValue = Math.max(0, ...[...peer.sales.values()].map((signal) => signal.value));
    const candidates: Candidate[] = [];
    for (const product of products) for (const need of needs) {
      const status = norm(product.ProductStatus ?? product.Status);
      if (status !== "" && status !== "active") continue;
      const categoryMatch = hasTerm(product.Category, need.categoryTerms);
      const productMatch = !categoryMatch && (hasTerm(product.ProductName, need.productTerms) || hasTerm(product.Brand, need.productTerms));
      if (!categoryMatch && !productMatch) continue;
      const productCode = norm(product.ProductCode); if (!productCode) continue;
      const signal = peer.sales.get(productCode) ?? { customers: new Set<string>(), value: 0 };
      const peerRank = maxPeerValue > 0 ? (signal.value / maxPeerValue) * 20 : 0;
      const productTier = inferProductTier(product);
      const tierBonus = commercialTier !== null && productTier === commercialTier ? 5 : 0;
      candidates.push({ productCode, productName: String(product.ProductName ?? productCode), brand: product.Brand ? String(product.Brand) : null, category: product.Category ? String(product.Category) : null, priority: Math.min(100, Math.round((categoryMatch ? 80 : 60) + peerRank + tierBonus)), confidence: categoryMatch ? 80 : 60, likelyNeed: need.tag, matchQuality: categoryMatch ? "CATEGORY" : "PRODUCT_TEXT", productTier, reasons: [categoryMatch ? "فئة المنتج تطابق الاحتياج" : "اسم/علامة المنتج تطابق الاحتياج", ...(tierBonus ? ["يتوافق مع الشريحة التجارية"] : []), ...(signal.value > 0 ? ["مباع لدى عملاء مشابهين"] : [])], peerSignals: { buyerCount: signal.customers.size, orderValue: signal.value, peerScope: peer.scope }, availability: "UNKNOWN" });
    }
    // A broad HoReCa profile can match a product through more than one need
    // (for example paper through hygiene and disposables). Keep the strongest
    // evidence-backed match once instead of repeating it as multiple offers.
    const bestByProduct = new Map<string, Candidate>();
    for (const candidate of candidates) {
      const existing = bestByProduct.get(candidate.productCode);
      if (!existing || candidate.priority > existing.priority || (candidate.priority === existing.priority && candidate.peerSignals.orderValue > existing.peerSignals.orderValue)) bestByProduct.set(candidate.productCode, candidate);
    }
    return [...bestByProduct.values()].sort((a, b) => b.priority - a.priority || b.peerSignals.orderValue - a.peerSignals.orderValue);
  }
}

function inferProductTier(product: EntityRecord): "PREMIUM" | "VALUE" | null {
  const text = `${String(product.Category ?? "")} ${String(product.ProductName ?? "")} ${String(product.Brand ?? "")}`.toLowerCase();
  if (/\bpremium\b|\bluxury\b/.test(text)) return "PREMIUM";
  if (/\beconomy\b|\bvalue\b|\bbudget\b/.test(text)) return "VALUE";
  return null;
}
