"use client";
import {useState} from "react";
import Link from "next/link";
import {useQuery} from "@tanstack/react-query";
import {wmsApi} from "@/lib/api/wms";
import {Card,CardHeader,CardTitle,CardContent} from "@/components/ui/card";
import {Badge} from "@/components/ui/badge";
import {Skeleton} from "@/components/ui/skeleton";
import {Button} from "@/components/ui/button";
import {ErrorBox,Pager,Search,stockQuantity,quantity,unitLabel,type Text} from "./shared";

export function WmsCoveragePanel({warehouse,company,t}:{warehouse:string;company:string;t:Text}) {
  const [page,setPage]=useState(1),[input,setInput]=useState(""),[search,setSearch]=useState("");
  const query=useQuery({queryKey:["wms",company,warehouse,"coverage",page,search],queryFn:()=>wmsApi.coverage(warehouse,page,search),retry:false,refetchOnWindowFocus:false,refetchOnReconnect:false});
  return <Card><CardHeader><CardTitle>{t("coverage.title")}</CardTitle></CardHeader><CardContent className="space-y-4">
    <p className="text-sm text-muted-foreground">{t("coverage.scope")}</p>
    <p className="text-xs text-muted-foreground">{t("coverage.policy")}</p>
    <Search id="coverage-search" value={input} onChange={setInput} onSearch={()=>{setSearch(input.trim());setPage(1);}} t={t}/>
    {query.isPending?<Skeleton className="h-48"/>:query.isError?<ErrorBox error={query.error} retry={()=>void query.refetch()} t={t}/>:<>
      <p className="text-xs text-muted-foreground">{t("coverage.period")} <bdi>{query.data.from} — {query.data.to}</bdi> · {t("coverage.stockTime")} <time dateTime={query.data.stockAsOf}><bdi>{query.data.stockAsOf}</bdi></time></p>
      {!query.data.items.length?<p className="py-6 text-sm text-muted-foreground">{t("coverage.empty")}</p>:<ul className="divide-y divide-border">{query.data.items.map(p=><li key={p.id} className="space-y-3 py-4">
        {/* Canonical demand has company/route scope, never verified warehouse attribution. */}
        <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-semibold">{p.name}</h3><p className="text-xs text-muted-foreground"><bdi>{p.code}</bdi> · {t("wms.carton")}</p></div><Badge variant="secondary">{t("coverage.undetermined")}</Badge></div>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {([[t("coverage.days"),p.daysOfCover===null?t("coverage.insufficient"):quantity(p.daysOfCover)],
            [t("coverage.daily"),p.dailyDemand===null?t("coverage.insufficient"):stockQuantity(p.dailyDemand,p.piecesPerCarton,p.baseUnit,t)],
            [t("wms.available"),stockQuantity(p.available,p.piecesPerCarton,p.baseUnit,t)],[t("wms.reserved"),stockQuantity(p.reserved,p.piecesPerCarton,p.baseUnit,t)],[t("wms.quarantined"),stockQuantity(p.quarantined,p.piecesPerCarton,p.baseUnit,t)]]).map(([label,value])=><div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 text-sm font-semibold tabular-nums">{value}</dd></div>)}
        </dl>
        <p className="text-sm">{p.daysOfCover!==null?t("coverage.companyEstimate"):t(`coverage.${p.reason}`)}</p>
        <p className="text-xs text-muted-foreground">{t("coverage.evidence",{days:p.demandDays})} · <bdi>{p.firstSale??"—"} — {p.lastSale??"—"}</bdi></p>
        <p className="text-xs text-muted-foreground">{t("coverage.leadMissing")}</p>
        {p.risk!=="SAFE"&&<p className="text-xs text-warning">{p.risk==="UNKNOWN"?t("coverage.reviewData"):t("coverage.reviewPurchase")}</p>}
        {p.purchaseReference&&<Button variant="outline" size="sm" asChild><Link href={`/sfa/procurement?warehouseId=${encodeURIComponent(warehouse)}&search=${encodeURIComponent(p.purchaseReference)}`}>{t("coverage.existingOrder")} · {p.purchaseReference}</Link></Button>}
      </li>)}</ul>}
      <Pager page={page} hasMore={query.data.hasMore} busy={query.isFetching} onChange={setPage} t={t}/>
    </>}
  </CardContent></Card>;
}
