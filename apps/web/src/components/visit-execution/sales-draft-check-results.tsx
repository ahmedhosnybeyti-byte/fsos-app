"use client";
import type {SalesDraft,SalesDraftCheck,SalesDraftAvailability} from "@field-sales-os/schemas";
import {useTranslation} from "@/components/translation-provider";
import {Badge} from "@/components/ui/badge";

export function draftCheckMatches(draft:SalesDraft,check:SalesDraftCheck){
 return check.draftId===draft.id&&check.draftVersion===draft.version&&check.warehouseId===draft.warehouseId;
}

export function SalesDraftCheckResults({draft,check}:{draft:SalesDraft;check:SalesDraftCheck}){
 const {t,locale}=useTranslation();
 const status=(state:SalesDraftAvailability)=><Badge variant={state==="UNAVAILABLE"?"destructive":state==="NEEDS_REVIEW"?"warning":"success"}>{t(`draft.${state}`)}</Badge>;
 if(!draftCheckMatches(draft,check))return <p role="alert" className="text-sm text-warning">{t("draft.checkStale")}</p>;
 return <div className="space-y-3" role="status" aria-live="polite">
  <p className="text-xs text-muted-foreground">{t("draft.checkedAt")}: {new Date(check.checkedAt).toLocaleString(locale)} · {t("draft.checkedVersion")}: {check.draftVersion}</p>
  <p className="text-sm text-warning">{t("draft.reviewOnly")}</p>
  <div className="grid gap-3 sm:grid-cols-2">{(["pricing","credit"] as const).map(kind=><div key={kind} className="space-y-2 rounded-md border border-border/60 p-3 text-sm">
   <p className="font-semibold">{t(kind==="pricing"?"draft.price":"draft.creditCheck")} · {status(check.commercial[kind].state)}</p>
   <p>{t("draft.unavailable")}</p>
   <ul className="space-y-1 ps-4 text-xs text-muted-foreground list-disc">{check.commercial[kind].blockers.map(reason=><li key={reason}>{t(`draft.${reason}`)}</li>)}</ul>
  </div>)}</div>
  {check.lines.map(l=>{const line=draft.lines.find(x=>x.lineNo===l.lineNo&&x.productId===l.productId);
   const baseUnit=line&&["PIECE","KG","LITRE"].includes(line.baseUnit)?t(`draft.${line.baseUnit as "PIECE"|"KG"|"LITRE"}`):line?.baseUnit;
   return <div key={l.lineNo} className="space-y-2 rounded-md border border-border/60 p-3 text-sm">
   <p className="font-semibold">{line?.productName}</p>
   <p>{t("draft.unitCheck")}: {status(l.unitState)} · {line?.unit==="CARTON"?t("draft.CARTON"):t("draft.BASE")} · {t("draft.baseQuantity")}: <bdi dir="ltr">{l.requestedBase}</bdi> ({baseUnit})</p>
   <p>{t("draft.price")}: {status(l.pricingState)} · {t("draft.unavailable")}</p>
   {l.state!=="CHECKED"?<p className="text-warning">{t("draft.changed")}</p>:<>
    <p>{t("draft.warehouseAvailable")}: {status(l.warehouseState)} · {l.warehouseAvailable??t("draft.noRecordedBalance")}</p>
    <p>{t("draft.eligibleLots")}: {l.warehouseEligibleLots} · {t("draft.nearestExpiry")}: {l.warehouseNearestExpiry?<bdi dir="ltr">{l.warehouseNearestExpiry}</bdi>:t("draft.noDatedLot")}</p>
    <p>{t("draft.custody")}: {l.ownCustody??t("draft.noRecordedBalance")}</p>
    <p>{t("draft.eligibleCustody")}: {status(l.custodyState)} · {l.eligibleCustody??t("draft.noRecordedBalance")}</p>
    <p>{t("draft.eligibleLots")}: {l.custodyEligibleLots} · {t("draft.nearestExpiry")}: {l.custodyNearestExpiry?<bdi dir="ltr">{l.custodyNearestExpiry}</bdi>:t("draft.noDatedLot")}</p>
    <p className="text-xs text-muted-foreground">{t("draft.appliedShelfLife")}: {l.minShelfLifeDays}</p>
   </>}
  </div>})}
  <p className="text-xs text-muted-foreground">{t("draft.custodyHint")}</p>
 </div>;
}
