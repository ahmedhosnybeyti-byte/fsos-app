import type { VisitCopilotCustomer } from "@/lib/types";

export type DemoMission = "تحصيل" | "مبيعات ضائعة" | "بيع متقاطع" | "عميل عالي المخاطر" | "فرصة جغرافية";

export interface DemoVisitMeta {
  mission: DemoMission;
  status: "مجدولة" | "قيد الزيارة";
}

// بيانات عرض مؤقتة فقط إلى أن تصل حقول المهمة والحالة من محرك الذكاء.
// لا تُرسل للخادم ولا تُستخدم في أي قرار تشغيلي.
const DEMO_MISSIONS: DemoMission[] = ["تحصيل", "مبيعات ضائعة", "بيع متقاطع", "عميل عالي المخاطر", "فرصة جغرافية"];

export function getDemoVisitMeta(customer: VisitCopilotCustomer, index: number): DemoVisitMeta {
  return {
    mission: DEMO_MISSIONS[index % DEMO_MISSIONS.length]!,
    status: customer.visitSequence === 1 ? "قيد الزيارة" : "مجدولة",
  };
}

export const DEMO_GEO_OPPORTUNITIES = [
  "أضف الصنف المقترح إلى الطلب الحالي بعد تأكيد توفره.",
  "اعرض بديلًا من المنتجات الأكثر طلبًا لدى العملاء القريبين.",
  "اسأل العميل عن سبب عدم طلب الصنف قبل إنهاء الزيارة.",
] as const;
