import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
const ts=require("typescript");require.extensions[".tsx"]=(m:NodeModule,f:string)=>(m as any)._compile(ts.transpileModule(readFileSync(f,"utf8"),{fileName:f,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,f);
const {TranslationProvider}=require("../translation-provider"),{WarehouseScreen}=require("./warehouse-screen");
test("company administrator sees category headings and carton balances while operational actions stay hidden",()=>{
 const client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:Infinity}}});
 client.setQueryData(["auth","me"],{id:"admin",companyId:"company",role:{code:"COMPANY_ADMIN"},permissions:["sfa.access","erp.admin.read"],featureAccess:{"warehouse-core":"ENABLED"}});
 client.setQueryData(["sfa-mode","company"],{operatingMode:"FULL_ERP"});
 client.setQueryData(["wms","company","warehouses",1,""],{items:[{id:"warehouse",code:"WH",name:"Display warehouse"}],page:1,hasMore:false});
 const totals={physical:"300",available:"300",reserved:"0",quarantined:"0",expired:"0",inTransit:"0"};
 client.setQueryData(["wms","company","warehouse","summary",30],{units:[{baseUnit:"PIECE",...totals,physical:"4800",available:"4800"}],cartons:totals,stockedProducts:3,nearExpiryBatches:0,expiredBatches:0,asOf:"2026-10-23T00:00:00Z"});
 const products=[{id:"one",name:"Milk",category:"ألبان",piecesPerCarton:12},{id:"two",name:"Yogurt",category:"ألبان",piecesPerCarton:12},{id:"three",name:"Chips",category:"سناكس",piecesPerCarton:24}].map(p=>({...p,code:p.id,barcode:null,baseUnit:"PIECE",physical:String(100*p.piecesPerCarton),available:String(100*p.piecesPerCarton),reserved:"0",quarantined:"0",inTransit:"0",isActive:true,trackBatches:false,trackExpiry:false,sensitiveHandling:false,handlingNotes:null,version:1}));
 client.setQueryData(["wms","company","warehouse","products",1,""],{items:products,page:1,hasMore:false});
 client.setQueryData(["wms","company","warehouse","batches",1,undefined,false,30],{items:[],page:1,hasMore:false});
 try{
 const html=renderToStaticMarkup(createElement(QueryClientProvider,{client},createElement(TranslationProvider,null,createElement(WarehouseScreen,{initialWarehouseId:"warehouse"}))));
 assert.equal((html.match(/>ألبان<\/h3>/g)??[]).length,1);assert.equal((html.match(/>سناكس<\/h3>/g)??[]).length,1);
 assert.match(html,/font-bold text-primary/);assert.match(html,/100 كرتونة/);assert.match(html,/300/);
 assert.doesNotMatch(html,/1200|2400|4800|صنف جديد|رصيد افتتاحي|استلام جديد|سجل الحركات/);
 }finally{client.clear();}
});
