"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { useTranslation } from "@/components/translation-provider";
import { Button } from "@/components/ui/button";
export function AccountingNav(){
 const {locale,t}=useTranslation();const {user}=useAuth();const path=usePathname();
 const links=[{href:"/sfa/accounting",label:t("accounting.chart_ledger_and_trial_balance"),permission:"accounting.read"},
 {href:"/sfa/accounting/receivables",label:t("accounting.customer_receivables"),permission:"accounting.ar.read"},
 {href:"/sfa/accounting/payables",label:t("accounting.supplier_payables"),permission:"accounting.ap.read"},
 {href:"/sfa/accounting/treasury",label:t("accounting.cash_and_banks"),permission:"accounting.treasury.read"},
 {href:"/dashboard/sales-price-exceptions",label:t("price.queueLink"),permission:"sales.price-exceptions.accounting"}];
 return <nav aria-label={t("accounting.accounting_section")} className="flex flex-wrap gap-2">{links.filter(l=>user?.role.code==="COMPANY_ADMIN"?l.href==="/sfa/accounting/treasury":user?.permissions?.includes(l.permission)).map(l=><Button key={l.href} asChild variant={path===l.href?"default":"outline"}><Link href={l.href} aria-current={path===l.href?"page":undefined}>{l.label}</Link></Button>)}</nav>;
}
