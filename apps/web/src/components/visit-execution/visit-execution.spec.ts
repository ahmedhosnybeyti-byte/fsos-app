import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { visitExecutionMessages } from "../../lib/i18n/visit-execution-messages";

// Test-only JSX loading with the already installed compiler. The gate's normal
// .ts loader and alias/security hooks remain in force; no browser/server I/O.
const ts = require("typescript");
require.extensions[".tsx"] = (module: NodeModule, filename: string) => (module as any)._compile(ts.transpileModule(readFileSync(filename,"utf8"), {
  fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText, filename);
const { TranslationProvider } = require("../translation-provider");
const { VisitExecutionScreen } = require("./visit-execution-screen");

function render(role = "SALES_REP", permissions = ["sfa.access","visits.execute"], completed = false, summaryError = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false, staleTime: Infinity, refetchOnMount: false }, mutations: { retry: false } } });
  client.setQueryData(["auth","me"], { id:"rep",companyId:"company",role:{code:role},permissions });
  client.setQueryData(["visit-execution","company","rep","visit"], { visit:{ id:"visit",customerCode:"C-1",customerName:"عميل الاختبار",repName:"مندوب الاختبار",entrySource:"VISIT_COPILOT",status:completed ? "COMPLETED" : "OPEN",version:0,goal:"COLLECTION",notes:completed ? "ملاحظة محفوظة" : "",outcome:completed ? "ACHIEVED" : null,failureReason:null,reasonDetail:"",startedAt:"2026-10-22T08:00:00Z",completedAt:completed ? "2026-10-22T09:00:00Z" : null },photos:[{id:"photo",kind:"COOLER",createdAt:"2026-10-22T08:15:00Z"}] });
  const contextKey = ["visit-execution-context","company","rep","visit","ar"];
  client.setQueryData(contextKey,{ briefing:{period:{from:"2026-07-22",to:"2026-10-21"},sales:{total:0,invoiceCount:0,trendPct:null},returns:{total:0,rate:null},dataAvailability:{returns:false,collections:false},topProducts:[],missingProducts:[],customer360:{averageInvoiceValue:null,soldSkus:[],lostSkus:[]}},lastInvoice:null,lastPayment:null,returnProducts:[],previousNotes:[],importedNotes:[],balance:null,collectionVisitSuccessRate:null });
  if (summaryError) client.getQueryCache().find({queryKey:contextKey})!.setState({data:undefined,status:"error",error:new Error("summary outage")});
  const html = renderToStaticMarkup(createElement(QueryClientProvider,{client},createElement(TranslationProvider,null,createElement(VisitExecutionScreen,{id:"visit"}))));
  client.clear(); return html;
}
test("Visit Execution renders permission denial before operational tools for admin and ungranted rep", () => {
  for (const html of [render("COMPANY_ADMIN"),render("SALES_REP",["sfa.access"])]) {
    assert.match(html,/بصلاحيات SFA/); assert.doesNotMatch(html,/id="visit-image"/);
  }
});
test("authorized rep sees grouped real-data empty states, capture and inert unimplemented financial entries", () => {
  const html = render();
  assert.match(html,/عميل الاختبار/); assert.match(html,/مندوب الاختبار/);
  assert.match(html,/لا توجد بيانات/); assert.match(html,/المبالغ المعلقة ليست رصيد/);
  assert.match(html,/2026-07-22/); assert.match(html,/2026-10-21/);
  assert.match(html,/فتح الكاميرا/); assert.match(html,/type="file"/); assert.match(html,/ثلاجة/);
  assert.doesNotMatch(html,/capture="environment"/); // File upload stays available alongside direct capture.
  assert.doesNotMatch(html,/dir="ltr"/);
  assert.match(html,/غياب الفاتورة وحده لا يعني فشل/);
  assert.match(html,/<button[^>]*disabled=""[^>]*>إنشاء فاتورة/);
});
test("completed visits keep persisted evidence readable and remove mutation actions", () => {
  const html = render("SALES_REP",undefined,true);
  assert.match(html,/زيارة منتهية/); assert.match(html,/ملاحظة محفوظة/); assert.match(html,/عرض الصورة/);
  assert.doesNotMatch(html,/حفظ وإنهاء الزيارة/); assert.doesNotMatch(html,/id="visit-image"/);
  assert.doesNotMatch(html,/فتح الكاميرا/);
});
test("analytical outage leaves the operational save/complete tools available", () => {
  const html = render("SALES_REP",undefined,false,true);
  assert.match(html,/تعذر تحميل ملخص العميل/); assert.match(html,/حفظ وإنهاء الزيارة/); assert.match(html,/id="visit-notes"/);
});
test("all Visit Execution copy has Arabic and English dictionary entries", () => {
  assert.deepEqual(Object.keys(visitExecutionMessages.ar).sort(),Object.keys(visitExecutionMessages.en).sort());
});
