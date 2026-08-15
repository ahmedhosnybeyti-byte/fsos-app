import type { DashboardMetric, DashboardTarget } from "@/lib/api/dashboard-performance";

export type DiagnosisKpi = "sales" | "collections" | "invoices" | "customers" | "skus" | "returns" | "target:SalesTarget" | "target:CollectionTarget";
type MetricKey = Exclude<DiagnosisKpi, `target:${string}`>;

export type DiagnosisContext = {
  entityId: string;
  entityType: "scope" | "supervisor" | "rep";
  entityName: string;
  selectedKpi: DiagnosisKpi;
  currentPeriod: string;
  comparisonPeriod?: string;
  currentKpiValue: number | null;
  comparisonKpiValue: number | null;
  relatedKpis: Record<MetricKey, DashboardMetric>;
  targetData?: DashboardTarget;
};

export type ContextualDiagnosis = {
  evidence: string[];
  interpretation: string;
  probableCause: string;
  confidence: "High" | "Medium" | "Low";
  decision: string;
  actions: string[];
  unknown: string;
};

const label: Record<MetricKey, string> = { sales: "المبيعات", collections: "التحصيل", invoices: "الفواتير", customers: "العملاء المشترون", skus: "الأصناف المباعة", returns: "المرتجعات" };
const format = (value: number | null) => value === null || !Number.isFinite(value) ? "غير متاح" : Math.round(value).toLocaleString("ar-SA");
const delta = (current: number | null, previous: number | null) => current === null || previous === null || previous === 0 ? null : ((current - previous) / Math.abs(previous)) * 100;
const percent = (value: number | null) => value === null ? "غير متاح" : `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
const metricDelta = (metric: DashboardMetric) => delta(metric.current, metric.benchmark);

// Rule-based field diagnosis: it uses the same evidence-first, no-unproven-cause
// discipline as Visit Copilot. Every output is derived from the clicked KPI context.
export function buildContextualDiagnosis(context: DiagnosisContext): ContextualDiagnosis {
  const selected: MetricKey = context.selectedKpi.startsWith("target:") ? (context.selectedKpi === "target:CollectionTarget" ? "collections" : "sales") : context.selectedKpi as MetricKey;
  const related = context.relatedKpis;
  const selectedChange = delta(context.currentKpiValue, context.comparisonKpiValue);
  const salesChange = metricDelta(related.sales);
  const invoiceChange = metricDelta(related.invoices);
  const customerChange = metricDelta(related.customers);
  const skuChange = metricDelta(related.skus);
  const collectionChange = metricDelta(related.collections);
  const returnsChange = metricDelta(related.returns);
  const evidence = [
    `${label[selected]}: ${format(context.currentKpiValue)} مقابل ${format(context.comparisonKpiValue)} (${percent(selectedChange)})`,
    `المبيعات: ${percent(salesChange)} · الفواتير: ${percent(invoiceChange)} · العملاء: ${percent(customerChange)}`,
    `التحصيل: ${percent(collectionChange)} · الأصناف: ${percent(skuChange)} · المرتجعات: ${percent(returnsChange)}`,
  ];
  if (context.targetData) evidence.unshift(`الهدف حتى اليوم: ${format(context.targetData.targetMtd)} · الفجوة: ${format(context.targetData.aheadBehind)} · الإنجاز: ${context.targetData.progressPct?.toFixed(1) ?? "غير متاح"}%`);
  const incomplete = selectedChange === null;
  if (incomplete) return {
    evidence,
    interpretation: `لا توجد مقارنة مكتملة لـ${label[selected]} عند ${context.entityName}.`,
    probableCause: "لا يمكن ترجيح سبب تشغيلي من دون قيمة مرجعية قابلة للمقارنة.",
    confidence: "Low",
    decision: "استكمل الفترة المرجعية قبل تغيير الأولوية الميدانية.",
    actions: ["تحقق من اكتمال الفترة المرجعية.", `راجع بيانات ${label[selected]} للكيان المحدد فقط.`],
    unknown: "لا تثبت البيانات الحالية سببًا ميدانيًا أو سلوكًا للعميل.",
  };

  const isTarget = context.selectedKpi.startsWith("target:");
  if (isTarget) {
    const target = context.targetData!; const behind = (target.aheadBehind ?? 0) < 0;
    const driver = selected === "sales" ? (customerChange !== null && customerChange < 0 ? "تراجع العملاء المنتجين" : invoiceChange !== null && invoiceChange < 0 ? "انخفاض تكرار الطلبات" : "انخفاض قيمة الطلب") : (collectionChange !== null && collectionChange < 0 ? "تراجع التحصيل" : "فجوة تحصيل تحتاج مراجعة العملاء المتأخرين");
    return { evidence, interpretation: behind ? `فجوة ${label[selected]} قائمة مقابل المسار المستهدف.` : `مسار ${label[selected]} متقدم على الهدف حتى اليوم.`, probableCause: behind ? `${driver} هو أقوى إشارة مرتبطة بالفجوة، وليس سببًا مثبتًا وحده.` : "المسار الحالي يدعم حماية الممارسة القائمة، مع استمرار ضبط المخاطر.", confidence: target.aheadBehind === null ? "Low" : "Medium", decision: behind ? `صحّح ${driver} قبل رفع الضغط على ${label[selected]}.` : `ثبّت مسار ${label[selected]} وراقب المؤشر المرتبط به.`, actions: behind ? (selected === "sales" ? ["حدد العملاء أو الفواتير المتراجعة.", "افحص التشكيلة قبل اقتراح طلبية محددة.", "راقب سد الفجوة يوميًا."] : ["ابدأ بالعملاء المتأخرين في التحصيل.", "ثبّت موعد تحصيل واضح.", "أعد تقييم الائتمان بعد التحصيل."]) : ["حافظ على إيقاع التنفيذ الحالي.", "راقب الفجوة يوميًا.", "لا توسع الائتمان إذا تراجع التحصيل."], unknown: "بيانات الهدف لا تثبت سببًا تفصيليًا داخل العميل أو الصنف." };
  }

  const plans: Record<MetricKey, Omit<ContextualDiagnosis, "evidence" | "confidence">> = {
    sales: customerChange !== null && customerChange < 0 ? { interpretation: "تراجع المبيعات يتحرك مع تقلص قاعدة العملاء المنتجين.", probableCause: "فقدان/توقف عملاء منتجين هو الإشارة الأقوى، ولا يثبت وحده سبب الزيارة.", decision: "استعد العملاء المتوقفين قبل توسيع التغطية.", actions: ["حدد العملاء المتوقفين.", "افحص الرف قبل الاقتراح.", "تابع عودة العميل بالفترة التالية."], unknown: "لا تثبت البيانات سبب توقف كل عميل." } : { interpretation: "المبيعات تتأثر بعمق الطلب أكثر من اتساع القاعدة عندما لا يتراجع العملاء.", probableCause: "قيمة أو تشكيلة الطلب هي الإشارة الأقوى وليست السعر أو المخزون المثبت.", decision: "ارفع عمق الطلب قبل زيادة الزيارات.", actions: ["راجع قيمة الفاتورة.", "حدد الأصناف أو الكميات الناقصة.", "راقب متوسط الطلب."], unknown: "لا تثبت البيانات السعر أو التوفر." },
    collections: { interpretation: "التحصيل مؤشر ائتماني يجب فصله عن نمو المبيعات.", probableCause: "تأخر التحصيل هو الإشارة الأقوى؛ لا تحدد الإجماليات العميل المتعثر.", decision: "أعط التحصيل أولوية قبل أي توسع ائتماني.", actions: ["راجع المتأخرات أولًا.", "ثبت موعد التحصيل.", "أعد تقييم إعادة الطلب بعد التحصيل."], unknown: "لا تثبت البيانات هوية العملاء المتأخرين." },
    invoices: customerChange !== null && customerChange < 0 ? { interpretation: "تراجع الفواتير مع العملاء يشير إلى ضعف إعادة تنشيط القاعدة.", probableCause: "توقف العملاء عن الطلب هو الإشارة الأقوى، وليس عدد الزيارات.", decision: "استعد العملاء المتوقفين قبل زيادة عدد الزيارات.", actions: ["حدد العملاء بلا طلبات.", "ثبت الطلبية التالية.", "راقب معدل الفواتير."], unknown: "الفواتير لا تثبت عدد الزيارات." } : { interpretation: "تغير الفواتير يقيس تكرار الطلب لا حجم الطلب.", probableCause: "تغير تكرار الطلب هو الإشارة الأقوى مع الحاجة لبيانات العميل لإثبات السبب.", decision: "صحح إيقاع إعادة الطلب قبل إضافة زيارات.", actions: ["راجع العملاء ذوي الطلبات المتوقفة.", "حدد موعد الطلبية التالية.", "راقب تكرار الفواتير."], unknown: "لا تثبت الفواتير سبب التوقف." },
    customers: { interpretation: "العملاء المشترون يقيسون اتساع القاعدة المنتجة.", probableCause: "انكماش القاعدة المنتجة هو الإشارة الأقوى، دون نسبة ذلك تلقائيًا للزيارات.", decision: "ابدأ باستعادة العملاء قبل البحث عن عملاء جدد.", actions: ["حدد العملاء المتوقفين.", "افحص التوفر على الرف.", "تابع إعادة التنشيط."], unknown: "لا تثبت البيانات جودة الزيارة." },
    skus: { interpretation: "الأصناف المباعة تقيس اتساع التشكيلة لا مجرد حجم المبيعات.", probableCause: "تقلص التشكيلة إشارة لتوفر أو توزيع أو عرض؛ لا يثبت نفاد مخزون.", decision: "راجع التشكيلة والتوفر قبل رفع ضغط البيع.", actions: ["حدد الأصناف المتوقفة.", "تحقق من التوفر الفعلي.", "اقترح صنفًا مكملاً بعد التحقق."], unknown: "لا تثبت البيانات نفاد صنف بعينه." },
    returns: { interpretation: "المرتجعات تقاس مقابل المبيعات ويصبح ارتفاعها مخاطرة تشغيلية.", probableCause: "عدم ملاءمة كمية التحميل أو التشكيلة هو الاحتمال الأقوى، وليس عيب جودة مثبتًا.", decision: "عالج نمط المرتجعات قبل زيادة التحميل أو المبيعات.", actions: ["حدد العملاء أو الأصناف المتكررة.", "قارن التوريد بالتصريف.", "عدّل التحميل تدريجيًا."], unknown: "لا تثبت البيانات التحميل الزائد أو سبب الجودة." },
  };
  const plan = plans[selected];
  return { evidence, ...plan, confidence: Math.abs(selectedChange) >= 10 && [salesChange, invoiceChange, customerChange, skuChange, collectionChange, returnsChange].filter((x) => x !== null).length >= 2 ? "High" : "Medium" };
}
