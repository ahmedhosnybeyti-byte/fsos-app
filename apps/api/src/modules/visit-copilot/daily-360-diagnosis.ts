export type Daily360Confidence = "عالٍ" | "متوسط" | "منخفض";

export interface Daily360Diagnosis {
  diagnosis: string;
  confidence: Daily360Confidence | null;
  visitAction: string;
  visitGoal: string;
}

export interface CustomerVisitDiagnosis {
  evidence: string[];
  diagnosis: string;
  confidence: Daily360Confidence | null;
  visitObjective: string;
  visitActions: string[];
}

const format = (value: number) => Math.round(value).toLocaleString("ar-EG");

/**
 * Rule-based customer × SKU visit diagnosis.
 *
 * It deliberately receives only measured facts.  It can describe a pattern,
 * but never turns an unmeasured cause (stockout, price, competitor, quality,
 * or customer refusal) into a fact.
 */
export function buildDaily360Diagnosis(input: {
  productName: string;
  sales90: number;
  sales30: number;
  suggestedQuantity: number;
  returnQuantity?: number | null;
  lastPurchaseDate?: string | null;
}): Daily360Diagnosis {
  const sales90 = Math.max(0, input.sales90);
  const sales30 = Math.max(0, input.sales30);
  const returns = Math.max(0, input.returnQuantity ?? 0);
  const lost = sales90 > 0 && sales30 === 0;
  const decline = sales90 > 0 && sales30 > 0 && sales30 * 3 < sales90;
  const positive = sales90 > 0 && sales30 > 0 && sales30 * 3 >= sales90;
  const lastPurchase = input.lastPurchaseDate ? ` آخر شراء مؤكد: ${input.lastPurchaseDate}.` : "";

  if (sales90 <= 0) {
    return {
      diagnosis: "لا توجد بيانات كافية لتحديد السبب بدقة.",
      confidence: null,
      visitAction: `تحقق من وجود بيانات شراء صالحة لـ${input.productName} قبل اقتراح الطلب.`,
      visitGoal: "تأكيد نقطة بداية قابلة للقياس لهذا الصنف.",
    };
  }

  if (lost && returns > 0) {
    return {
      diagnosis: `توقف شراء بعد صافي مبيعات ${format(sales90)} خلال 90 يومًا وصفر خلال آخر 30 يومًا، مع مرتجعات مثبتة قدرها ${format(returns)}.${lastPurchase} لا توجد بيانات كافية لتحديد السبب بدقة.`,
      confidence: "متوسط",
      visitAction: `راجع الكمية السابقة مقابل المرتجع قبل إعادة تحميل ${input.productName}.`,
      visitGoal: `تحديد كمية إعادة آمنة لـ${input.productName} دون تجاوز الطلب المثبت.`,
    };
  }

  if (lost) {
    return {
      diagnosis: `Lost Sales: كان لصنف ${input.productName} صافي مبيعات ${format(sales90)} خلال 90 يومًا، ثم توقف تمامًا خلال آخر 30 يومًا.${lastPurchase} لا توجد بيانات كافية لتحديد السبب بدقة.`,
      confidence: "متوسط",
      visitAction: `استفسر عن سبب توقف ${input.productName} وحاول استرجاعه؛ تحقق من وجود الصنف لدى العميل قبل اقتراح الطلب.`,
      visitGoal: `إعادة ${input.productName} بكمية تدريجية لا تتجاوز ${format(input.suggestedQuantity)}.`,
    };
  }

  if (decline) {
    const drop = Math.round((1 - sales30 / sales90) * 100);
    return {
      diagnosis: `تراجع في معدل أو عمق الطلب: صافي مبيعات ${input.productName} انخفض من ${format(sales90)} خلال 90 يومًا إلى ${format(sales30)} خلال آخر 30 يومًا (${drop}%). لا توجد بيانات كافية لتحديد السبب بدقة.`,
      confidence: "متوسط",
      visitAction: `أكد استمرار ${input.productName} ووسّع الكمية تدريجيًا وفق الطلب الفعلي.`,
      visitGoal: `رفع الطلب التالي لـ${input.productName} تدريجيًا مع قياس الاستجابة.`,
    };
  }

  if (positive) {
    return {
      diagnosis: `أداء إيجابي مستمر: صافي مبيعات ${input.productName} خلال آخر 30 يومًا (${format(sales30)}) يواكب أو يتجاوز معدل 90 يومًا (${format(sales90)}).`,
      confidence: "عالٍ",
      visitAction: `حافظ على توفر ${input.productName} وأكد استمرار الصنف قبل توسيع الكمية تدريجيًا.`,
      visitGoal: `الحفاظ على معدل الطلب الحالي لـ${input.productName} مع توسع محسوب.`,
    };
  }

  return {
    diagnosis: "لا توجد بيانات كافية لتحديد السبب بدقة.",
    confidence: null,
    visitAction: `تحقق من بيانات ${input.productName} قبل اتخاذ قرار تحميل.`,
    visitGoal: "تأكيد البيانات المطلوبة للقرار.",
  };
}

/** Uses the same evidence-first rules for the main Customer Visit Card. */
export function buildCustomerVisitDiagnosis(input: {
  salesTotal: number;
  invoiceCount: number;
  trendPct: number | null;
  firstHalfSales: number;
  secondHalfSales: number;
  returnsTotal: number;
  pendingCollection: number;
  bouncedCollection: number;
  overdueCollection: number;
  lostSkus: readonly { productName: string; baselineNetQuantity: number; suggestedQuantity: number }[];
  topProduct: { productName: string; value: number } | null;
  missingProduct: { productName: string; peerValue: number } | null;
}): CustomerVisitDiagnosis {
  const evidence: string[] = [
    `المبيعات ${format(input.salesTotal)} عبر ${input.invoiceCount} فاتورة خلال الفترة.`,
  ];
  if (input.trendPct !== null) evidence.push(`النصف الثاني ${input.trendPct >= 0 ? "أعلى" : "أقل"} من الأول بـ${format(Math.abs(input.trendPct))}% (${format(input.firstHalfSales)} ← ${format(input.secondHalfSales)}).`);
  if (input.lostSkus.length > 0) evidence.push(`${input.lostSkus.length} أصناف توقفت في آخر 30 يومًا بعد مبيعات سابقة.`);
  if (input.returnsTotal > 0) evidence.push(`مرتجعات مثبتة بقيمة ${format(input.returnsTotal)}.`);
  const collectionRisk = input.bouncedCollection + input.overdueCollection;
  if (collectionRisk > 0) evidence.push(`تحصيل مرتد أو متأخر بقيمة ${format(collectionRisk)}.`);

  if (collectionRisk > 0) {
    return {
      evidence,
      diagnosis: input.bouncedCollection > 0 ? "ضغط تحصيلي مثبت: التحصيل المرتد أو المتأخر هو الأولوية قبل أي طلب جديد." : "تحصيل متأخر مثبت: يلزم تأمين التحصيل قبل توسيع البيع.",
      confidence: "عالٍ",
      visitObjective: `تحصيل ${format(collectionRisk)} أو الاتفاق على تسوية واضحة قبل تسجيل طلب جديد.`,
      visitActions: [
        `ناقش مبلغ التحصيل المتأخر/المرتد (${format(collectionRisk)}) وحدد التزامًا واضحًا.`,
        input.lostSkus.length > 0 ? `بعد تأمين التحصيل، ركز على استعادة ${input.lostSkus[0]!.productName} بدل إضافة صنف جديد.` : "لا توسع الطلب قبل تأكيد التحصيل.",
      ],
    };
  }

  if (input.lostSkus.length > 0) {
    const primary = input.lostSkus[0]!;
    return {
      evidence,
      diagnosis: `فقدان توزيع مثبت: تراجع العميل يرتبط بتوقف ${input.lostSkus.length} أصناف، أبرزها ${primary.productName}؛ لا توجد بيانات كافية لتحديد سبب التوقف بدقة.`,
      confidence: "عالٍ",
      visitObjective: `استعادة توزيع ${primary.productName} تدريجيًا قبل اقتراح أصناف جديدة.`,
      visitActions: [
        `استفسر عن سبب توقف ${primary.productName} وتحقق من وجوده لدى العميل.`,
        `اقترح إعادة ${primary.productName} بكمية لا تتجاوز ${format(primary.suggestedQuantity)}.`,
        input.returnsTotal > 0 ? "راجع المرتجعات قبل زيادة كمية أي صنف مستعاد." : "ركز على استعادة الأصناف المفقودة بدل إضافة SKU جديد.",
      ],
    };
  }

  if (input.returnsTotal > 0) {
    return {
      evidence,
      diagnosis: "المرتجعات هي إشارة الضغط الظاهرة؛ لا توجد بيانات كافية لتحديد سببها بدقة.",
      confidence: "متوسط",
      visitObjective: "مراجعة المرتجع والكمية السابقة قبل أي زيادة في الطلب.",
      visitActions: ["راجع الأصناف والكميات المرتجعة مع العميل.", "أكد استمرار الأصناف الحالية قبل اقتراح تحميل إضافي."],
    };
  }

  if (input.trendPct !== null && input.trendPct < 0) {
    return {
      evidence,
      diagnosis: "تراجع مثبت في قيمة الطلب خلال الفترة، دون دليل يثبت سببًا تشغيليًا أو تجاريًا محددًا.",
      confidence: "متوسط",
      visitObjective: "تأكيد استمرار الأصناف الحالية واستعادة عمق الطلب تدريجيًا.",
      visitActions: [
        input.topProduct ? `أكد استمرار ${input.topProduct.productName}، وهو أعلى صنف بقيمة ${format(input.topProduct.value)}.` : "راجع الأصناف الحالية قبل اقتراح أي جديد.",
        "استفسر عن التغير في الطلب وسجل الملاحظة دون افتراض السبب.",
      ],
    };
  }

  if (input.missingProduct) {
    return {
      evidence,
      diagnosis: `فرصة بيع متقاطع مثبتة: العميل لا يشتري ${input.missingProduct.productName} بينما حقق لدى عملاء القناة ${format(input.missingProduct.peerValue)} خلال الفترة.`,
      confidence: "متوسط",
      visitObjective: `تجربة ${input.missingProduct.productName} بكمية أولى مناسبة.`,
      visitActions: [`اعرض ${input.missingProduct.productName} كطلب تجريبي.`, "أكد ملاءمة الصنف للعميل قبل تسجيل الطلب."],
    };
  }

  return {
    evidence,
    diagnosis: input.salesTotal > 0 ? "أداء العميل مستقر ضمن البيانات المتاحة؛ لا توجد إشارة ضغط مثبتة." : "لا توجد بيانات كافية لتحديد السبب بدقة.",
    confidence: input.salesTotal > 0 ? "متوسط" : null,
    visitObjective: input.topProduct ? `الحفاظ على استمرار ${input.topProduct.productName} ومتابعة الطلب.` : "تأكيد بيانات العميل ونقطة البداية للطلب.",
    visitActions: [input.topProduct ? `تحقق من استمرار ${input.topProduct.productName} قبل توسيع الكمية تدريجيًا.` : "تحقق من بيانات العميل قبل اقتراح الطلب."],
  };
}
