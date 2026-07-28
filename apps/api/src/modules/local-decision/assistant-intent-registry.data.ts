// FDA Local Decision Layer — Smart Assistant Intent Registry (design catalog).
//
// Client's explicit direction (2026-07-26): stop classifying individual
// questions ("مديونية العميل" vs "الرصيد المتأخر" vs "كام عليه؟") — classify
// INTENTS. Many different phrasings collapse into one Intent
// (GetCustomerOutstandingBalance below is a direct example of the client's
// own). Questions will keep changing; Intents are the stable unit the Rule
// Registry and Local Decision Layer are actually built on.
//
// What this file IS: the catalog of the top ~40 Intents, each fully
// specified per the client's 7-field schema (id, description, required
// entities, required time context, local-answerability, the real backend
// service that would answer it, a response template, and whether an AI
// fallback exists). This is the design/reference layer — every field is
// grounded in services and fields that genuinely exist today (RieFacade,
// SgiService.getLatest, OrgUnitsService, dataset-query.util, Canonical
// Entities/fields) — nothing invented. See the per-field research this file
// is based on (RieFacade.getEntityRecords, SgiService.getLatest,
// CanonicalHierarchyResolverService.resolveAllowedRouteIds,
// OrgUnitsService.list/getOne, import-templates.data.ts field names).
//
// What this file is NOT (yet): it does not execute anything. It is not
// wired into AssistantService.chat(), and it does not extend
// RuleDefinition/RuleRegistry from rule-engine.ts — that engine's contract
// (regex pattern -> Facts -> LocalAnswer/LocalSection) is narrower than an
// Intent (which also needs entity resolution + time-context parsing +
// business-service dispatch before it can answer). Wiring real intents into
// execution is deliberately a separate, later phase — per "don't build
// tomorrow's code today," this pass is the catalog only.
//
// canLocalAnswer semantics:
//   "yes"    — a deterministic value is computable today from real fields
//              via the cited Business Service, with no interpretation.
//   "no"     — genuinely requires reasoning/interpretation/recommendation
//              an AI must produce (trend explanation, "why", "what should I
//              do"), even once entities/time are resolved.
//   "partial"— locally computable as a plain fact, but the question as
//              commonly phrased usually also asks for interpretation
//              ("ليه" / "توصية") layered on top; the fact itself is local,
//              a following AI turn may add color. Modeled explicitly rather
//              than forced into yes/no, since collapsing it either way
//              would misrepresent what actually happens today.

export type RequiredEntity = "Customer" | "Employee" | "Branch" | "Region" | "Product" | "Invoice" | "Route" | "None";

export type RequiredTimeContext = "Today" | "Month" | "DateRange" | "Custom" | "None";

export type CanAnswerLocally = "yes" | "no" | "partial";

export interface AssistantIntent {
  /** Stable identifier — PascalCase verb-first, per the client's own example (GetCustomerOutstandingBalance). Never renamed once shipped; phrasings change, this doesn't. */
  intentId: string;
  /** One-line description of what business question this Intent answers. */
  description: string;
  /** Real Arabic phrasings observed/expected that all collapse into this one Intent. Not exhaustive — the Regex/Dictionary Engines match variations of these, not this literal list. */
  samplePhrasings: readonly string[];
  requiredEntities: readonly RequiredEntity[];
  requiredTimeContext: RequiredTimeContext;
  canAnswerLocally: CanAnswerLocally;
  /** The real, existing backend service + method that would compute this today. Cites exact file + method names — never a service that doesn't exist yet. */
  requiredBusinessService: string;
  /** Arabic template with {placeholders} for the fields the Business Service actually returns. Not the exact final copy — the shape the Template Builder would render. */
  responseTemplate: string;
  /** Whether, even after a local answer, an AI turn commonly adds value (interpretation, advice) on top — distinct from canAnswerLocally="no". */
  aiFallback: "yes" | "no";
}

export const ASSISTANT_INTENT_REGISTRY: readonly AssistantIntent[] = [
  // ───────────────────────── Customer ─────────────────────────
  {
    intentId: "GetCustomerOutstandingBalance",
    description: "مديونية/رصيد عميل معين المستحق حاليًا",
    samplePhrasings: ["مديونية العميل", "الرصيد المتأخر", "كام عليه؟", "المبلغ المستحق؟", "عليه فلوس؟"],
    requiredEntities: ["Customer"],
    requiredTimeContext: "None",
    canAnswerLocally: "yes",
    requiredBusinessService:
      "RieFacade.getEntityRecords('Invoices'|'Collections', ctx) filtered by CustomerCode, then sum(Invoices.TotalAfterVAT) − sum(Collections.Amount) — same derivation SGI's COLLECTION_RISK situation already uses.",
    responseTemplate: "مديونية العميل {customerName} ({customerCode}) الحالية: {outstandingAmount} جنيه.",
    aiFallback: "no",
  },
  {
    intentId: "GetCustomerLastVisit",
    description: "آخر زيارة تمت لعميل معين ومتى",
    samplePhrasings: ["آخر زيارة للعميل", "امتى اتزار العميل ده", "متى تمت آخر زيارة؟"],
    requiredEntities: ["Customer"],
    requiredTimeContext: "None",
    canAnswerLocally: "yes",
    requiredBusinessService: "RieFacade.getEntityRecords('Visits', ctx) filtered by CustomerCode, sorted by VisitDate desc, take 1.",
    responseTemplate: "آخر زيارة للعميل {customerName} كانت يوم {visitDate}، الحالة: {visitStatus}.",
    aiFallback: "no",
  },
  {
    intentId: "GetCustomerLastOrder",
    description: "آخر فاتورة/طلب لعميل معين",
    samplePhrasings: ["آخر أوردر للعميل", "آخر فاتورة له", "امتى اشترى آخر مرة؟"],
    requiredEntities: ["Customer"],
    requiredTimeContext: "None",
    canAnswerLocally: "yes",
    requiredBusinessService: "RieFacade.getEntityRecords('Invoices', ctx) filtered by CustomerCode, sorted by InvoiceDate desc, take 1.",
    responseTemplate: "آخر فاتورة للعميل {customerName}: رقم {invoiceNo} بتاريخ {invoiceDate} بقيمة {totalAfterVAT} جنيه.",
    aiFallback: "no",
  },
  {
    intentId: "GetCustomerSalesTotal",
    description: "إجمالي مبيعات عميل معين خلال فترة",
    samplePhrasings: ["مبيعات العميل الشهر ده", "إجمالي مشترياته", "كام اشترى منه من كذا لكذا؟"],
    requiredEntities: ["Customer"],
    requiredTimeContext: "Month",
    canAnswerLocally: "yes",
    requiredBusinessService:
      "RieFacade.getEntityRecords('Invoice Items', ctx) joined to Invoices by InvoiceNo, filtered by CustomerCode + InvoiceDate range, sum(LineTotal) — platform convention (Team Performance/SGI/Heat Map all compute sales this way, not Invoices.TotalAfterVAT directly).",
    responseTemplate: "إجمالي مبيعات العميل {customerName} خلال {periodLabel}: {totalSales} جنيه.",
    aiFallback: "no",
  },
  {
    intentId: "GetCustomerReturns",
    description: "إجمالي المرتجعات لعميل معين خلال فترة",
    samplePhrasings: ["مرتجعات العميل", "كام رجع من عنده؟", "قيمة المرتجع"],
    requiredEntities: ["Customer"],
    requiredTimeContext: "Month",
    canAnswerLocally: "yes",
    requiredBusinessService: "RieFacade.getEntityRecords('Returns', ctx) filtered by CustomerCode + ReturnDate range, sum(TotalAmount).",
    responseTemplate: "إجمالي مرتجعات العميل {customerName} خلال {periodLabel}: {totalReturns} جنيه.",
    aiFallback: "no",
  },
  {
    intentId: "IsCustomerInactive",
    description: "هل عميل معين توقف عن الشراء/خامل من فترة",
    samplePhrasings: ["العميل ده بايظ؟", "توقف عن الشراء؟", "خامل من امتى؟"],
    requiredEntities: ["Customer"],
    requiredTimeContext: "None",
    canAnswerLocally: "yes",
    requiredBusinessService: "SgiService.getLatest(user) → situations filtered by type=CUSTOMER_INACTIVE and matching CustomerCode.",
    responseTemplate: "العميل {customerName} خامل منذ {daysSinceLastOrder} يوم (آخر شراء: {lastOrderDate}).",
    aiFallback: "yes",
  },
  {
    intentId: "IsCustomerDeclining",
    description: "هل مبيعات عميل معين في تراجع",
    samplePhrasings: ["مبيعاته نازلة؟", "العميل بيتراجع؟", "في انخفاض عنده؟"],
    requiredEntities: ["Customer"],
    requiredTimeContext: "None",
    canAnswerLocally: "partial",
    requiredBusinessService: "SgiService.getLatest(user) → situations filtered by type=CUSTOMER_DECLINING and matching CustomerCode.",
    responseTemplate: "العميل {customerName} في تراجع: {declinePct}% مقارنة بالفترة السابقة.",
    aiFallback: "yes",
  },
  {
    intentId: "GetTopCustomersByRevenue",
    description: "أعلى العملاء مبيعًا خلال فترة (لمندوب/فرع/الشركة حسب الصلاحية)",
    samplePhrasings: ["أكبر العملاء", "أعلى عميل في المبيعات", "مين أكتر عميل بيشتري؟"],
    requiredEntities: ["None"],
    requiredTimeContext: "Month",
    canAnswerLocally: "yes",
    requiredBusinessService:
      "RieFacade.getEntityRecords('Invoice Items', ctx) joined to Invoices, groupBy CustomerCode, aggregate sum(LineTotal), sortDir desc, limit N — same filter/aggregate/groupBy/sort machinery assistant.service.ts's query_dataset tool already exposes via dataset-query.util.ts.",
    responseTemplate: "أعلى {n} عملاء خلال {periodLabel}: {rankedList}.",
    aiFallback: "no",
  },

  // ───────────────────────── Employee / Salesperson ─────────────────────────
  {
    intentId: "GetEmployeeSalesTotal",
    description: "إجمالي مبيعات مندوب/موظف معين خلال فترة",
    samplePhrasings: ["مبيعات المندوب", "أداء المندوب من ناحية المبيعات", "كام باع الشهر ده؟"],
    requiredEntities: ["Employee"],
    requiredTimeContext: "Month",
    canAnswerLocally: "yes",
    requiredBusinessService:
      "RieFacade.getEntityRecords('Invoice Items', ctx) joined to Invoices by InvoiceNo (Invoices.RouteID = temporal snapshot), filtered by resolved Employee's RouteID(s) + date range, sum(LineTotal). Route-to-employee link via Routes.SalesRepID/SupervisorID/ManagerID.",
    responseTemplate: "إجمالي مبيعات {employeeName} خلال {periodLabel}: {totalSales} جنيه.",
    aiFallback: "no",
  },
  {
    intentId: "GetEmployeeTargetProgress",
    description: "نسبة تحقيق المندوب لهدف الشهر",
    samplePhrasings: ["وصل لهدفه قد ايه؟", "نسبة تحقيق الهدف", "قربنا نخلص التارجت؟"],
    requiredEntities: ["Employee"],
    requiredTimeContext: "Month",
    canAnswerLocally: "yes",
    requiredBusinessService: "SgiService.getLatest(user) → summary.monthlyGoal ({targetTotal, actualTotal, progressPct}), role-scoped automatically (rep sees own, supervisor sees team).",
    responseTemplate: "{employeeName} حقق {progressPct}% من هدف الشهر ({actualTotal} من أصل {targetTotal} جنيه).",
    aiFallback: "no",
  },
  {
    intentId: "IsEmployeeBehindTarget",
    description: "هل مندوب/فرع/منطقة متأخر عن هدف الشهر",
    samplePhrasings: ["متأخر عن الهدف؟", "مين متأخر عن التارجت؟", "مندوبين تحت الهدف"],
    requiredEntities: ["Employee"],
    requiredTimeContext: "Month",
    canAnswerLocally: "yes",
    requiredBusinessService: "SgiService.getLatest(user) → situations filtered by type=TARGET_BEHIND.",
    responseTemplate: "{employeeName} متأخر عن هدف الشهر بنسبة {behindPct}%.",
    aiFallback: "yes",
  },
  {
    intentId: "GetEmployeeVisitsToday",
    description: "عدد/قائمة زيارات مندوب معين اليوم",
    samplePhrasings: ["زياراته النهاردة كام؟", "عمل كام زيارة اليوم؟", "خطة اليوم بتاعته"],
    requiredEntities: ["Employee"],
    requiredTimeContext: "Today",
    canAnswerLocally: "yes",
    requiredBusinessService: "RieFacade.getEntityRecords('Visits', ctx) filtered by resolved Employee's RouteID + VisitDate=today.",
    responseTemplate: "{employeeName} عمل {visitCount} زيارة النهاردة، منهم {productiveCount} منتجة.",
    aiFallback: "no",
  },
  {
    intentId: "GetEmployeeCoverageRate",
    description: "نسبة تغطية خطة الزيارات لمندوب خلال فترة",
    samplePhrasings: ["نسبة التغطية بتاعته", "التزامه بخطة الزيارات", "معدل الزيارات المنتجة"],
    requiredEntities: ["Employee"],
    requiredTimeContext: "Month",
    canAnswerLocally: "yes",
    requiredBusinessService: "RieFacade.getEntityRecords('Visits', ctx) filtered by Employee's RouteID + date range, computeAggregate ratio of VisitStatus=Productive / total (dataset-query.util.ts computeAggregate).",
    responseTemplate: "نسبة تغطية {employeeName} خلال {periodLabel}: {coveragePct}% ({productiveCount} من {totalPlanned} زيارة).",
    aiFallback: "no",
  },
  {
    intentId: "GetEmployeeCollections",
    description: "إجمالي التحصيل الذي أنجزه مندوب خلال فترة",
    samplePhrasings: ["حصّل كام؟", "التحصيل بتاعه الشهر ده", "إجمالي المقبوضات منه"],
    requiredEntities: ["Employee"],
    requiredTimeContext: "Month",
    canAnswerLocally: "yes",
    requiredBusinessService: "RieFacade.getEntityRecords('Collections', ctx) filtered by Employee's RouteID + CollectionDate range, sum(Amount).",
    responseTemplate: "إجمالي تحصيل {employeeName} خلال {periodLabel}: {totalCollected} جنيه.",
    aiFallback: "no",
  },
  {
    intentId: "GetEmployeeReturns",
    description: "إجمالي مرتجعات مندوب خلال فترة",
    samplePhrasings: ["مرتجعاته كام؟", "نسبة المرتجع عنده", "كام رجع من شغله؟"],
    requiredEntities: ["Employee"],
    requiredTimeContext: "Month",
    canAnswerLocally: "yes",
    requiredBusinessService: "RieFacade.getEntityRecords('Returns', ctx) filtered by Employee's RouteID + ReturnDate range, sum(TotalAmount).",
    responseTemplate: "إجمالي مرتجعات {employeeName} خلال {periodLabel}: {totalReturns} جنيه.",
    aiFallback: "no",
  },
  {
    intentId: "GetTopEmployeesByRevenue",
    description: "أعلى المندوبين مبيعًا خلال فترة",
    samplePhrasings: ["أفضل مندوب", "مين أعلى مندوب في المبيعات؟", "ترتيب المناديب"],
    requiredEntities: ["None"],
    requiredTimeContext: "Month",
    canAnswerLocally: "yes",
    requiredBusinessService: "TeamPerformanceService.query(user, input) — per-rep sales/collection/returns rollup grouped by supervisor, already computed this exact ranking (apps/api/src/modules/team-performance/team-performance.service.ts).",
    responseTemplate: "أعلى {n} مندوبين خلال {periodLabel}: {rankedList}.",
    aiFallback: "no",
  },
  {
    intentId: "GetEmployeeManager",
    description: "من هو المدير المباشر لموظف معين",
    samplePhrasings: ["مديره المباشر مين؟", "تحت إشراف مين؟", "المسؤول عنه"],
    requiredEntities: ["Employee"],
    requiredTimeContext: "None",
    canAnswerLocally: "yes",
    requiredBusinessService: "EmployeesService.resolveContext(companyId, employeeId) → {managerId, managerName}.",
    responseTemplate: "{employeeName} تحت إشراف {managerName} مباشرة.",
    aiFallback: "no",
  },

  // ───────────────────────── Branch / Region ─────────────────────────
  {
    intentId: "GetBranchSalesTotal",
    description: "إجمالي مبيعات فرع معين خلال فترة",
    samplePhrasings: ["مبيعات الفرع", "إجمالي بيع الفرع ده", "أداء الفرع في المبيعات"],
    requiredEntities: ["Branch"],
    requiredTimeContext: "Month",
    canAnswerLocally: "yes",
    requiredBusinessService: "RieFacade.getEntityRecords('Invoice Items', ctx) joined to Invoices+Customers/Routes by BranchID, filtered by resolved Branch (via OrgUnitsService) + date range, sum(LineTotal).",
    responseTemplate: "إجمالي مبيعات فرع {branchName} خلال {periodLabel}: {totalSales} جنيه.",
    aiFallback: "no",
  },
  {
    intentId: "GetBranchTargetProgress",
    description: "نسبة تحقيق فرع معين لهدف الشهر",
    samplePhrasings: ["الفرع وصل لهدفه قد ايه؟", "نسبة تحقيق الفرع", "هدف الفرع"],
    requiredEntities: ["Branch"],
    requiredTimeContext: "Month",
    canAnswerLocally: "yes",
    requiredBusinessService: "SgiService.getLatest(user) → summary.monthlyGoal, scoped to the resolved Branch's employees/routes.",
    responseTemplate: "فرع {branchName} حقق {progressPct}% من هدف الشهر ({actualTotal} من أصل {targetTotal} جنيه).",
    aiFallback: "no",
  },
  {
    intentId: "GetRegionSalesTotal",
    description: "إجمالي مبيعات منطقة معينة خلال فترة",
    samplePhrasings: ["مبيعات المنطقة", "إجمالي بيع المنطقة دي", "أداء المنطقة"],
    requiredEntities: ["Region"],
    requiredTimeContext: "Month",
    canAnswerLocally: "yes",
    requiredBusinessService: "RieFacade.getEntityRecords('Invoice Items', ctx) joined to Invoices+Branches by resolved Region (via OrgUnitsService, Branches.RegionID), filtered by date range, sum(LineTotal).",
    responseTemplate: "إجمالي مبيعات منطقة {regionName} خلال {periodLabel}: {totalSales} جنيه.",
    aiFallback: "no",
  },
  {
    intentId: "CompareBranches",
    description: "مقارنة أداء فرعين أو أكثر خلال فترة",
    samplePhrasings: ["قارن بين الفرعين", "مين أحسن، فرع كذا ولا فرع كذا؟", "الفرق بين الفروع"],
    requiredEntities: ["Branch"],
    requiredTimeContext: "Month",
    canAnswerLocally: "partial",
    requiredBusinessService: "Two GetBranchSalesTotal-equivalent RieFacade calls, one per resolved Branch — the comparison/interpretation of WHY one outperforms the other is not locally derivable.",
    responseTemplate: "فرع {branchNameA}: {totalSalesA} جنيه، فرع {branchNameB}: {totalSalesB} جنيه.",
    aiFallback: "yes",
  },

  // ───────────────────────── Product ─────────────────────────
  {
    intentId: "GetProductSalesTotal",
    description: "إجمالي مبيعات منتج معين خلال فترة",
    samplePhrasings: ["مبيعات المنتج ده", "كام اتباع من الصنف ده؟", "إجمالي بيع المنتج"],
    requiredEntities: ["Product"],
    requiredTimeContext: "Month",
    canAnswerLocally: "yes",
    requiredBusinessService: "RieFacade.getEntityRecords('Invoice Items', ctx) filtered by ProductCode + InvoiceDate range (join to Invoices), sum(LineTotal).",
    responseTemplate: "إجمالي مبيعات المنتج {productName} خلال {periodLabel}: {totalSales} جنيه.",
    aiFallback: "no",
  },
  {
    intentId: "GetTopProductsByRevenue",
    description: "أعلى المنتجات مبيعًا خلال فترة",
    samplePhrasings: ["أكتر منتج بيتباع", "المنتجات الأعلى مبيعًا", "أفضل صنف في المبيعات"],
    requiredEntities: ["None"],
    requiredTimeContext: "Month",
    canAnswerLocally: "yes",
    requiredBusinessService: "RieFacade.getEntityRecords('Invoice Items', ctx), groupBy ProductCode, aggregate sum(LineTotal), sortDir desc, limit N.",
    responseTemplate: "أعلى {n} منتجات خلال {periodLabel}: {rankedList}.",
    aiFallback: "no",
  },
  {
    intentId: "GetCustomerMissingProducts",
    description: "منتجات لم يشترها عميل معين رغم توفرها",
    samplePhrasings: ["إيه المنتجات اللي مبيشتريهاش", "منتجات غايبة عنده", "إيه اللي ممكن نبيعه له كمان"],
    requiredEntities: ["Customer"],
    requiredTimeContext: "None",
    canAnswerLocally: "partial",
    requiredBusinessService: "RieFacade.getEntityRecords('Invoice Items','Products', ctx) — set difference of Products vs products purchased by CustomerCode is locally computable; ranking WHICH gap is most worth pursuing is the same 'GROWTH_OPPORTUNITY' judgment SGI already renders (SgiService.getLatest situations).",
    responseTemplate: "المنتجات التي لم يشترها {customerName}: {missingProductsList}.",
    aiFallback: "yes",
  },

  // ───────────────────────── Collections / Financial ─────────────────────────
  {
    intentId: "GetOverdueCollections",
    description: "قائمة/إجمالي التحصيلات المتأخرة (تجاوزت تاريخ الاستحقاق)",
    samplePhrasings: ["فلوس متأخرة", "تحصيلات فات ميعادها", "مين عليه مديونية متأخرة؟"],
    requiredEntities: ["None"],
    requiredTimeContext: "None",
    canAnswerLocally: "yes",
    requiredBusinessService: "RieFacade.getEntityRecords('Collections', ctx) filtered by Status=Pending + DueDate < today, or SgiService.getLatest situations filtered by type=COLLECTION_RISK for the pre-scored/prioritized view.",
    responseTemplate: "إجمالي التحصيلات المتأخرة: {totalOverdue} جنيه، عدد العملاء: {customerCount}.",
    aiFallback: "no",
  },
  {
    intentId: "GetCollectionsTotal",
    description: "إجمالي التحصيل (مندوب/فرع/الشركة حسب الصلاحية) خلال فترة",
    samplePhrasings: ["إجمالي التحصيل", "كام اتحصل الشهر ده؟", "التحصيلات الكلية"],
    requiredEntities: ["None"],
    requiredTimeContext: "Month",
    canAnswerLocally: "yes",
    requiredBusinessService: "RieFacade.getEntityRecords('Collections', ctx) filtered by CollectionDate range (hierarchy-scoped automatically), sum(Amount).",
    responseTemplate: "إجمالي التحصيل خلال {periodLabel}: {totalCollected} جنيه.",
    aiFallback: "no",
  },

  // ───────────────────────── Sales / Invoices (no entity, aggregate) ─────────────────────────
  {
    intentId: "GetTotalSales",
    description: "إجمالي المبيعات (حسب نطاق صلاحية المستخدم) خلال فترة",
    samplePhrasings: ["إجمالي المبيعات", "كام باعنا الشهر ده؟", "المبيعات الكلية"],
    requiredEntities: ["None"],
    requiredTimeContext: "Month",
    canAnswerLocally: "yes",
    requiredBusinessService: "RieFacade.getEntityRecords('Invoice Items', ctx) filtered by date range (hierarchy-scoped automatically via applyHierarchyFilter), sum(LineTotal).",
    responseTemplate: "إجمالي المبيعات خلال {periodLabel}: {totalSales} جنيه.",
    aiFallback: "no",
  },
  {
    intentId: "GetSalesGrowth",
    description: "نسبة نمو/تراجع المبيعات مقارنة بفترة سابقة",
    samplePhrasings: ["فيه نمو ولا لأ؟", "المبيعات زادت ولا قلت؟", "مقارنة بالشهر اللي فات"],
    requiredEntities: ["None"],
    requiredTimeContext: "Month",
    canAnswerLocally: "yes",
    requiredBusinessService: "Two RieFacade.getEntityRecords('Invoice Items', ctx) calls (current period + prior period), sum(LineTotal) each, percentage delta — the raw numbers are local; a WHY explanation is not.",
    responseTemplate: "المبيعات خلال {periodLabel}: {currentTotal} جنيه، مقابل {previousTotal} جنيه في {previousPeriodLabel} — نسبة التغير: {growthPct}%.",
    aiFallback: "yes",
  },
  {
    intentId: "GetLostSalesSituations",
    description: "عملاء توقفوا فجأة عن الشراء (فقدان مبيعات)",
    samplePhrasings: ["عملاء وقفوا فجأة", "مين اختفى من عندنا؟", "فقدنا مين من العملاء؟"],
    requiredEntities: ["None"],
    requiredTimeContext: "None",
    canAnswerLocally: "yes",
    requiredBusinessService: "SgiService.getLatest(user) → situations filtered by type=LOST_SALES.",
    responseTemplate: "عدد العملاء الذين توقفوا فجأة عن الشراء: {count}. أعلى {n} حالة: {rankedList}.",
    aiFallback: "yes",
  },
  {
    intentId: "GetGrowthOpportunities",
    description: "فرص نمو محسوبة مسبقًا (عملاء/مناطق لديها إمكانية زيادة مبيعات)",
    samplePhrasings: ["فيه فرص نمو؟", "مين ممكن نزود البيع له؟", "فرص لسه ما استغلتهاش"],
    requiredEntities: ["None"],
    requiredTimeContext: "None",
    canAnswerLocally: "yes",
    requiredBusinessService: "SgiService.getLatest(user) → situations filtered by type=GROWTH_OPPORTUNITY.",
    responseTemplate: "عدد فرص النمو المتاحة: {count}. أعلى {n} فرصة: {rankedList}.",
    aiFallback: "yes",
  },
  {
    intentId: "GetProductDeclineSituations",
    description: "منتجات في تراجع مبيعات ملحوظ",
    samplePhrasings: ["منتجات مبيعاتها نازلة", "أصناف في تراجع", "إيه المنتجات اللي وقفت؟"],
    requiredEntities: ["None"],
    requiredTimeContext: "None",
    canAnswerLocally: "yes",
    requiredBusinessService: "SgiService.getLatest(user) → situations filtered by type=PRODUCT_DECLINE.",
    responseTemplate: "عدد المنتجات في تراجع: {count}. أبرزها: {rankedList}.",
    aiFallback: "yes",
  },

  // ───────────────────────── Visits ─────────────────────────
  {
    intentId: "GetTodayVisitsSummary",
    description: "ملخص زيارات اليوم (حسب نطاق صلاحية المستخدم)",
    samplePhrasings: ["زيارات النهاردة", "عملنا كام زيارة اليوم؟", "خطة اليوم"],
    requiredEntities: ["None"],
    requiredTimeContext: "Today",
    canAnswerLocally: "yes",
    requiredBusinessService: "RieFacade.getEntityRecords('Visits', ctx) filtered by VisitDate=today (hierarchy-scoped automatically), computeAggregate count grouped by VisitStatus.",
    responseTemplate: "زيارات اليوم: {totalVisits}، منها {productiveCount} منتجة و{nonProductiveCount} غير منتجة.",
    aiFallback: "no",
  },
  {
    intentId: "GetCustomerVisitFrequency",
    description: "معدل تكرار زيارة عميل معين خلال فترة",
    samplePhrasings: ["بيتزار كام مرة؟", "معدل زياراته", "دورة الزيارة بتاعته"],
    requiredEntities: ["Customer"],
    requiredTimeContext: "Month",
    canAnswerLocally: "yes",
    requiredBusinessService: "RieFacade.getEntityRecords('Visits', ctx) filtered by CustomerCode + date range, count grouped by month/week.",
    responseTemplate: "العميل {customerName} تمت زيارته {visitCount} مرة خلال {periodLabel}.",
    aiFallback: "no",
  },

  // ───────────────────────── Van / Inventory ─────────────────────────
  {
    intentId: "GetVanInventoryStatus",
    description: "رصيد مخزون العربة الحالي لمندوب معين",
    samplePhrasings: ["مخزون العربة", "معاه كام من الصنف ده؟", "رصيد الفان"],
    requiredEntities: ["Employee"],
    requiredTimeContext: "Today",
    canAnswerLocally: "yes",
    requiredBusinessService: "RieFacade.getEntityRecords('Van Inventory', ctx) filtered by resolved Employee's RouteID + latest ReportDate.",
    responseTemplate: "رصيد عربة {employeeName} اليوم: {inventorySummary}.",
    aiFallback: "no",
  },
  {
    intentId: "GetVanLoadReconciliation",
    description: "تسوية تحميل العربة (تحميل − مبيعات − مرتجعات = المتبقي)",
    samplePhrasings: ["فيه عجز في العربة؟", "التسوية متظبطة؟", "الجرد مظبوط؟"],
    requiredEntities: ["Employee"],
    requiredTimeContext: "Today",
    canAnswerLocally: "yes",
    requiredBusinessService: "RieFacade.getEntityRecords('Van Loads','Invoice Items','Return Items', ctx) filtered by resolved Employee's RouteID + LoadNo — Load minus Sales minus Returns per ProductCode/Unit, the platform's documented custody-reconciliation formula.",
    responseTemplate: "تسوية عربة {employeeName}: الفروق الموجودة: {discrepancyList}.",
    aiFallback: "yes",
  },

  // ───────────────────────── Executive / Cross-cutting ─────────────────────────
  {
    intentId: "GetMonthlyTargetProgress",
    description: "نسبة تحقيق الهدف الشهري (حسب نطاق صلاحية المستخدم: مندوب/مشرف/تنفيذي)",
    samplePhrasings: ["وصلنا لهدف الشهر قد ايه؟", "نسبة تحقيق الهدف العام", "قربنا نخلص التارجت الشهري؟"],
    requiredEntities: ["None"],
    requiredTimeContext: "Month",
    canAnswerLocally: "yes",
    requiredBusinessService: "SgiService.getLatest(user) → summary.monthlyGoal, already role-scoped (rep=own, supervisor=team, executive=company-wide).",
    responseTemplate: "تحقيق هدف الشهر: {progressPct}% ({actualTotal} من أصل {targetTotal} جنيه).",
    aiFallback: "no",
  },
  {
    intentId: "GetTodayPriorities",
    description: "أهم المواقف التي تحتاج متابعة اليوم (مرتبة بالأولوية)",
    samplePhrasings: ["مين محتاج متابعة النهارده؟", "إيه أولويات اليوم؟", "على إيه أركز النهاردة؟"],
    requiredEntities: ["None"],
    requiredTimeContext: "Today",
    canAnswerLocally: "yes",
    requiredBusinessService: "SgiService.getLatest(user) → situations, sorted by existing priority (high/medium/low) — this is the exact computed list the 'Sales Growth'/Priority screens already render, not a new computation.",
    responseTemplate: "أهم {n} مواقف تحتاج متابعة اليوم: {rankedSituationsList}.",
    aiFallback: "yes",
  },
  {
    intentId: "CompareEmployees",
    description: "مقارنة أداء مندوبين أو أكثر خلال فترة",
    samplePhrasings: ["قارن بين المندوبين", "مين أحسن، فلان ولا فلان؟", "الفرق بينهم في الأداء"],
    requiredEntities: ["Employee"],
    requiredTimeContext: "Month",
    canAnswerLocally: "partial",
    requiredBusinessService: "Two GetEmployeeSalesTotal-equivalent calls, one per resolved Employee, or TeamPerformanceService.query for a ready-made rollup — the numeric comparison is local; explaining WHY one outperforms is not.",
    responseTemplate: "{employeeNameA}: {totalSalesA} جنيه، {employeeNameB}: {totalSalesB} جنيه.",
    aiFallback: "yes",
  },
  {
    intentId: "WhyIsPerformanceDown",
    description: "تفسير سبب انخفاض أداء (عميل/مندوب/فرع/منتج)",
    samplePhrasings: ["ليه الأداء نازل؟", "ايه سبب التراجع؟", "ليه المبيعات وقعت؟"],
    requiredEntities: ["None"],
    requiredTimeContext: "Custom",
    canAnswerLocally: "no",
    requiredBusinessService: "No deterministic Business Service answers 'why' — genuinely requires AI reasoning over the raw figures (which the above Intents supply as grounding context via query_dataset/get_sales_growth_situations).",
    responseTemplate: "(لا يوجد رد محلي ثابت — يُمرَّر لـ AI مع بيانات السياق المتاحة)",
    aiFallback: "yes",
  },
  {
    intentId: "GetRecommendedAction",
    description: "توصية بإجراء يجب اتخاذه لموقف معين",
    samplePhrasings: ["أعمل إيه؟", "إيه التوصية؟", "إيه الخطوة الجاية؟"],
    requiredEntities: ["None"],
    requiredTimeContext: "None",
    canAnswerLocally: "partial",
    requiredBusinessService: "SgiService.getLatest(user) → situations already carry a ready-to-execute recommendation field per situation; a genuinely NEW recommendation not tied to an existing situation requires AI.",
    responseTemplate: "التوصية الجاهزة لهذا الموقف: {recommendationText}.",
    aiFallback: "yes",
  },
] as const;

export const ASSISTANT_INTENT_IDS: ReadonlySet<string> = new Set(ASSISTANT_INTENT_REGISTRY.map((i) => i.intentId));
