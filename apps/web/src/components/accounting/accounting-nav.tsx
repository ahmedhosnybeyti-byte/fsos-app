"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { useTranslation } from "@/components/translation-provider";
import { Button } from "@/components/ui/button";
export function AccountingNav(){
 const {locale}=useTranslation();const {user}=useAuth();const path=usePathname();const t=(ar:string,en:string)=>locale==="ar"?ar:en;
 const links=[{href:"/sfa/accounting",label:t("الدليل والأستاذ والميزان","Chart, ledger and trial balance"),permission:"accounting.read"},
 {href:"/sfa/accounting/receivables",label:t("حسابات العملاء","Customer receivables"),permission:"accounting.ar.read"},
 {href:"/sfa/accounting/payables",label:t("حسابات الموردين","Supplier payables"),permission:"accounting.ap.read"},
 {href:"/sfa/accounting/treasury",label:t("النقدية والبنوك","Cash and banks"),permission:"accounting.treasury.read"}];
 return <nav aria-label={t("قسم الحسابات","Accounting section")} className="flex flex-wrap gap-2">{links.filter(l=>user?.permissions?.includes(l.permission)).map(l=><Button key={l.href} asChild variant={path===l.href?"default":"outline"}><Link href={l.href} aria-current={path===l.href?"page":undefined}>{l.label}</Link></Button>)}</nav>;
}
