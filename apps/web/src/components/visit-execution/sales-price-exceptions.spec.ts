import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import type {PriceExceptionRequest} from "@field-sales-os/schemas";
const ts=require("typescript");require.extensions[".tsx"]=(m:NodeModule,f:string)=>(m as any)._compile(ts.transpileModule(readFileSync(f,"utf8"),{fileName:f,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,f);
const {TranslationProvider}=require("../translation-provider"),{PriceRequestDetail,SalesPriceExceptionsScreen}=require("./sales-price-exceptions-panel");
const request:PriceExceptionRequest={id:"request",draftId:"draft",draftVersion:2,requesterId:"rep",customerCode:"C1",customerName:"عميل",channel:"Cash Van",routeId:"r1",productId:"p",productCode:"P",productName:"صنف",unit:"CARTON",conversionFactor:12,kind:"SPECIAL_PRICE",value:"10.123456",currency:"SAR",reason:"طلب موثق",desiredFrom:"2026-11-01",desiredTo:null,status:"SUBMITTED",version:0,reviewedBy:null,decidedBy:null,createdAt:"2026-10-23T00:00:00Z",priceBefore:null,activation:"REQUIRES_SETUP",attachments:"UNAVAILABLE",events:[{version:0,actorId:"rep",actorName:"مندوب",action:"REQUEST",reason:"سبب محفوظ",evidenceType:"EMAIL",evidenceReference:"official-ref",evidenceAttested:false,createdAt:"2026-10-23T00:00:00Z"}]};
function render(role:string,status=request.status){const client=new QueryClient();const html=renderToStaticMarkup(createElement(QueryClientProvider,{client},createElement(TranslationProvider,null,createElement(PriceRequestDetail,{role,request:{...request,status},onDirty:()=>{},onSaved:()=>{}}))));client.clear();return html;}
test("B2 UI exposes review only to supervisor and commercial decision only to manager after review",()=>{
 const sup=render("SUPERVISOR");assert.match(sup,/توثيق المراجعة والإحالة للمدير/);assert.doesNotMatch(sup,/>موافقة تجارية موثقة|>رفض موثق</);assert.match(sup,/type="checkbox"/);
 assert.doesNotMatch(render("MANAGER"),/type="checkbox"/);assert.match(render("MANAGER","REVIEWED"),/>موافقة تجارية موثقة/);
 for(const role of ["SALES_REP","ACCOUNTANT"]){const html=render(role,"APPROVED");assert.doesNotMatch(html,/type="checkbox"/);assert.match(html,/التفعيل محجوب/);assert.match(html,/السعر التشغيلي السابق غير معتمد/);assert.match(html,/10.123456/);assert.match(html,/official-ref/);assert.doesNotMatch(html,/<input[^>]+type="file"/);}
});
test("B2 denied queue cannot render approval/request actions",()=>{
 const client=new QueryClient({defaultOptions:{queries:{retry:false}}});client.setQueryData(["auth","me"],{id:"rep",companyId:"a",role:{code:"SALES_REP"},permissions:["sfa.access"]});
 const html=renderToStaticMarkup(createElement(QueryClientProvider,{client},createElement(TranslationProvider,null,createElement(SalesPriceExceptionsScreen))));assert.match(html,/دورًا وصلاحية مستقلة/);assert.doesNotMatch(html,/توثيق المراجعة|إرسال الطلب للمشرف/);client.clear();
});
