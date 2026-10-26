import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {dictionaries} from "../../lib/i18n/dictionaries";
const ts=require("typescript");
require.extensions[".tsx"]=(m:NodeModule,f:string)=>(m as any)._compile(ts.transpileModule(readFileSync(f,"utf8"),{fileName:f,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,f);
const {LoadingRecipientPanel}=require("./loading-recipient-panel"),{TranslationProvider}=require("../translation-provider");
function render(mode="FULL_ERP",company="a",role="SALES_REP",showDetail=false){
 const client=new QueryClient({defaultOptions:{queries:{retry:false,refetchOnMount:false,staleTime:Infinity,gcTime:Infinity}}});
 client.setQueryData(["auth","me"],{id:"rep",companyId:company,role:{code:role},permissions:["sfa.access"],featureAccess:{"warehouse-core":"ENABLED"}});
 client.setQueryData(["sfa-mode",company],{operatingMode:mode});
 client.setQueryData(["loading-recipient","a","rep","list",1],{items:[{id:"load",reference:"OWN-READY",warehouseId:"w",warehouseName:"Warehouse",status:"APPROVED",version:5,targetDate:"2098-01-01",recipientConfirmed:false}],page:1,hasMore:false});
 client.setQueryData(["loading-recipient","b","rep","list",1],{items:[],page:1,hasMore:false});
 const row=(client.getQueryData(["loading-recipient","a","rep","list",1]) as any).items[0];
 client.setQueryData(["loading-recipient","a","rep","detail","load"],{...row,lines:[
  {id:'one',productCode:'P-01',productName:'Water product',category:'Water',unit:'CARTON',requestedQuantity:'7',preparedQuantity:'7',shortageQuantity:'0'},
  {id:'two',productCode:'P-02',productName:'Juice product',category:'Juice',unit:'CARTON',requestedQuantity:'5',preparedQuantity:'4',shortageQuantity:'1'},
 ]});
 const react=require('react'),state=react.useState,dialog=require('../ui/dialog'),originalDialog={...dialog};
 const groups=require('../products/product-category-groups'),originalGroups=groups.ProductCategoryGroups;
 if(showDetail){
  react.useState=(initial:any)=>state(initial===null?row:initial);
  // Portals do not render during SSR. Keep the real panel and shared grouping;
  // expose portal children and expand supplied groups to inspect every row.
  for(const key of ['Dialog','DialogContent','DialogHeader','DialogTitle','DialogDescription'])dialog[key]=({children}:any)=>createElement('div',null,children);
  groups.ProductCategoryGroups=(props:any)=>createElement(originalGroups,{...props,search:'expanded-test'});
 }
 try{return renderToStaticMarkup(createElement(QueryClientProvider,{client},createElement(TranslationProvider,null,createElement(LoadingRecipientPanel))));}finally{react.useState=state;Object.assign(dialog,originalDialog);groups.ProductCategoryGroups=originalGroups;client.clear();}
}
test("recipient inbox announces own prepared load without general warehouse grants",()=>{const html=render();assert.match(html,/OWN-READY/);assert.match(html,/جاهز لمراجعتك وموافقتك/);assert.match(html,/مراجعة وقبول أو رفض/);assert.match(html,/طلبات التحميل والاستلام/);});
test("recipient inbox stays hidden in Analysis/SFA and for warehouse roles",()=>{assert.equal(render("ANALYSIS_ONLY"),"");assert.equal(render("SFA"),"");assert.equal(render("FULL_ERP","a","WAREHOUSE_KEEPER"),"");});
test("recipient inbox caches remain scoped to company and authenticated recipient",()=>{assert.doesNotMatch(render("FULL_ERP","b"),/OWN-READY/);assert.match(render("FULL_ERP","b"),/لا توجد طلبات تحميل مرتبطة بحسابك/);});
test("consent and shortage messages exist in both supported languages",()=>{for(const key of ["smartLoading.approvePreparedQuantities","smartLoading.awaitingRecipientConsent","smartLoading.loadingShortage","smartLoading.custodyAfterConsent"] as const){assert.ok(dictionaries.ar[key]);assert.ok(dictionaries.en[key]);}});
test("loading quantities disclosure shows every product in shared category groups with whole-load decisions",()=>{
 const html=render('FULL_ERP','a','SALES_REP',true);
 for(const value of ['مراجعة وقبول أو رفض','Water product','Juice product','P-01','P-02','Water','Juice','فتح الكل','طي الكل','قبول كامل','رفض كامل'])assert.ok(html.includes(value),value);
 assert.equal((html.match(/Water product/g)??[]).length,1);assert.equal((html.match(/Juice product/g)??[]).length,1);
 assert.doesNotMatch(html,/<input|<select|<textarea/);
 assert.equal(dictionaries.en['smartLoading.showLoadingQuantities'],'Show loading quantities');
});
