import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {salesDraftMessages} from "../../lib/i18n/sales-draft-messages";
import {SALES_DRAFT_PRICE_BLOCKERS,SALES_DRAFT_CREDIT_BLOCKERS,type SalesDraftCheck,type SalesDraft} from "@field-sales-os/schemas";
const ts=require("typescript");require.extensions[".tsx"]=(m:NodeModule,f:string)=>(m as any)._compile(ts.transpileModule(readFileSync(f,"utf8"),{fileName:f,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,f);
const {TranslationProvider}=require("../translation-provider"),{SalesDraftsPanel,SalesDraftEditor}=require("./sales-drafts-panel");
const {SalesDraftCheckResults,draftCheckMatches}=require("./sales-draft-check-results");
const scope=["sales-drafts","a","rep","v"];
const draft={id:"d",visitId:"v",customerName:"عميل اختبار",customerCode:"C1",repName:"مندوب اختبار",status:"DRAFT",version:1,warehouseId:"w",warehouseName:"مستودع اختبار",notes:"محتوى محفوظ",editable:true,createdAt:"2026-10-22T00:00:00Z",updatedAt:"2026-10-22T00:00:00Z",lines:[{lineNo:1,productId:"p",productCode:"P1",productName:"صنف محفوظ",baseUnit:"PIECE",quantity:"2.000000",unit:"CARTON",conversionFactor:12,quantityBase:"24.000000"}]};
function render(closed=false,cancelled=false,denied=false,expanded=true){
 const client=new QueryClient({defaultOptions:{queries:{retry:false,retryOnMount:false,refetchOnMount:false,staleTime:Infinity}}});
 client.setQueryData(["auth","me"],{id:"rep",companyId:"a",role:{code:"SALES_REP"},permissions:denied?["sfa.access","visits.execute"]:["sfa.access","visits.execute","sales.drafts.manage"]});
 client.setQueryData([...scope,"warehouses","",1],{items:[],hasMore:false});client.setQueryData([...scope,"products","w","",1],{items:[],hasMore:false});client.setQueryData([...scope,"list",1],{items:[],hasMore:false,page:1});
 const component=denied?createElement(SalesDraftsPanel,{visit:{id:"v",status:"OPEN"}}):createElement(SalesDraftEditor,{draft:{...draft,status:cancelled?"CANCELLED":"DRAFT",editable:!closed&&!cancelled},visitClosed:closed,scope,onDirty:()=>{},onSaved:()=>{},onReload:()=>{}});
 // Product groups now start collapsed. Exercise their real expanded rendering
 // through the existing search expansion prop; retain all row/permission assertions.
 const groups=require("../products/product-category-groups"),original=groups.ProductCategoryGroups;
 if(expanded)groups.ProductCategoryGroups=(props:any)=>createElement(original,{...props,search:props.search||"test-expanded"});
 try{return renderToStaticMarkup(createElement(QueryClientProvider,{client},createElement(TranslationProvider,null,component)));}
 finally{groups.ProductCategoryGroups=original;client.clear();}
}

test("saved draft rows start collapsed and remain available when their group expands",()=>{
 const collapsed=render(false,false,false,false);
 assert.match(collapsed,/aria-expanded="false"/);assert.doesNotMatch(collapsed,/صنف محفوظ/);
 assert.match(render(),/صنف محفوظ/);
});
test("draft editor renders saved content, explicit unavailable finance and empty operational catalogue",()=>{
 const html=render();assert.match(html,/صنف محفوظ/);assert.match(html,/محتوى محفوظ/);assert.match(html,/24.000000/);assert.match(html,/يتطلب إعداد/);assert.match(html,/لم تُحتسب إجماليات/);assert.match(html,/لا توجد أصناف تشغيلية/);assert.match(html,/حفظ المسودة/);assert.match(html,/فحص المسودة المحفوظة/);
 assert.doesNotMatch(html,/إصدار فاتورة|اعتماد البيع|Posting/);
});
test("closed/cancelled drafts retain readable contents and remove save/cancel actions",()=>{
 for(const html of [render(true),render(false,true)]){assert.match(html,/صنف محفوظ/);assert.match(html,/محتوى محفوظ/);assert.doesNotMatch(html,/>حفظ المسودة</);assert.doesNotMatch(html,/>إلغاء المسودة</);assert.match(html,/<fieldset disabled=""/)}
});
test("draft permission is explicit and separate from visit execution",()=>{const html=render(false,false,true);assert.match(html,/صلاحية صريحة/);assert.doesNotMatch(html,/>إنشاء مسودة بيع</)});
test("draft copy has complete Arabic/English key parity",()=>assert.deepEqual(Object.keys(salesDraftMessages.ar).sort(),Object.keys(salesDraftMessages.en).sort()));

const checked:SalesDraftCheck={checkedAt:"2026-10-22T10:00:00Z",draftId:"d",draftVersion:1,warehouseId:"w",nonbinding:true,approvalAllowed:false,
 pricing:"REQUIRES_SETUP",priceSource:null,tax:null,discount:null,credit:null,
 commercial:{pricing:{state:"NEEDS_REVIEW",reason:"REQUIRES_SETUP",blockers:SALES_DRAFT_PRICE_BLOCKERS},credit:{state:"NEEDS_REVIEW",reason:"REQUIRES_SETUP",blockers:SALES_DRAFT_CREDIT_BLOCKERS}},
 lines:[{lineNo:1,productId:"p",requestedBase:"24.000000",warehouseAvailable:"100.000000",ownCustody:"12.000000",eligibleCustody:"12.000000",warehouseShort:false,custodyShort:true,state:"CHECKED",unitState:"AVAILABLE",warehouseState:"AVAILABLE",custodyState:"UNAVAILABLE",pricingState:"NEEDS_REVIEW",priceReason:"REQUIRES_SETUP",minShelfLifeDays:3,warehouseEligibleLots:2,custodyEligibleLots:1,warehouseNearestExpiry:"2026-10-25",custodyNearestExpiry:"2026-11-01"}]};
function renderCheck(check=checked){return renderToStaticMarkup(createElement(TranslationProvider,null,createElement(SalesDraftCheckResults,{draft,check})))}
test("B1 renders distinct availability, per-line pricing and explicit credit blockers with eligible lot evidence",()=>{
 const html=renderCheck();for(const copy of ["متاح","غير متاح","يحتاج مراجعة","يتطلب إعدادًا","تحقق الائتمان","عدد التشغيلات المؤهلة","2026-10-25","نسخة المسودة المفحوصة","التوفر تمهيدي"])assert.ok(html.includes(copy),copy);
 for(const reason of [...SALES_DRAFT_PRICE_BLOCKERS,...SALES_DRAFT_CREDIT_BLOCKERS])assert.ok(html.includes(salesDraftMessages.ar[`draft.${reason}`]));
});
test("B1 hides stale revision/warehouse/identity results so another session cannot appear to validate local content",()=>{
 for(const extra of [{draftVersion:2},{draftId:"other"},{warehouseId:"other"}]){const value={...checked,...extra};assert.equal(draftCheckMatches(draft as SalesDraft,value),false);const html=renderCheck(value);assert.ok(html.includes(salesDraftMessages.ar["draft.checkStale"]));assert.ok(!html.includes("2026-10-25"));assert.ok(!html.includes("100.000000"));}
 assert.equal(draftCheckMatches(draft as SalesDraft,checked),true);
});
