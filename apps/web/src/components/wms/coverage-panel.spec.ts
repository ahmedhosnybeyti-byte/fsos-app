import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import type {WmsCoverageResult,WmsCoverageRisk} from "@field-sales-os/schemas";
import {dictionaries,type Locale,type TranslationKey} from "../../lib/i18n/dictionaries";

// This focused Node test renders actual TSX without a browser or network access.
const ts=require("typescript");
require.extensions[".tsx"]=(module:NodeModule,filename:string)=>{
  (module as NodeModule & {_compile:(source:string,file:string)=>void})._compile(ts.transpileModule(readFileSync(filename,"utf8"),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true},
  }).outputText,filename);
};
const {WmsCoveragePanel}=require("./coverage-panel.tsx");
const {TranslationProvider}=require("../translation-provider");

function render(locale:Locale,risk:WmsCoverageRisk,estimate=true,expanded=true){
  const client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:Infinity}}});
  const data:WmsCoverageResult={page:1,hasMore:false,from:"2026-09-22",to:"2026-10-21",stockAsOf:"2026-10-22T00:00:00Z",items:[{
    id:"p",code:"P-040",name:"Original product",baseUnit:"PIECE",piecesPerCarton:12,available:"4800.000000",reserved:"12.000000",quarantined:"24.000000",
    dailyDemand:estimate?"1554.400000":null,daysOfCover:estimate?"3.09":null,demandDays:estimate?26:0,firstSale:null,lastSale:null,
    risk,reason:estimate?({CRITICAL:"LOW",WATCH:"MONITOR",SAFE:"SUFFICIENT",UNKNOWN:"HISTORY"} as const)[risk]:"HISTORY",
    leadTimeDays:null,purchaseReference:"EXISTING-PO",
  }]};
  client.setQueryData(["wms","company","warehouse","coverage",1,""],data);
  const t=(key:TranslationKey,params?:Record<string,string|number>)=>dictionaries[locale][key].replace(/\{(\w+)\}/g,(_,k)=>String(params?.[k]??""));
  const groups=require("../products/product-category-groups"),original=groups.ProductCategoryGroups;
  if(expanded)groups.ProductCategoryGroups=(props:any)=>createElement(original,{...props,search:props.search||"test-expanded"});
  try{return renderToStaticMarkup(createElement(QueryClientProvider,{client},createElement(TranslationProvider,null,createElement(WmsCoveragePanel,{warehouse:"warehouse",company:"company",t}))));}
  finally{groups.ProductCategoryGroups=original;client.clear();}
}

for(const locale of ["ar","en"] as const){
  test(`coverage rows start collapsed and expand without losing their evidence (${locale})`,()=>{
    const html=render(locale,"CRITICAL",true,false);
    assert.ok(html.includes('aria-expanded="false"'));
    assert.ok(!html.includes("Original product"));
    assert.ok(render(locale,"CRITICAL").includes("Original product"));
  });
  test(`company-demand estimates never render warehouse critical/watch/safe classifications (${locale})`,()=>{
    for(const risk of ["CRITICAL","WATCH","SAFE"] as const){
      const html=render(locale,risk);
      assert.ok(html.includes(dictionaries[locale]["coverage.undetermined"]));
      assert.ok(html.includes(dictionaries[locale]["coverage.scope"]));
      assert.ok(html.includes(dictionaries[locale]["coverage.companyEstimate"].replaceAll("'","&#x27;")));
      for(const label of ["CRITICAL","WATCH","SAFE"] as const)assert.ok(!html.includes(`>${dictionaries[locale][`coverage.${label}`]}<`));
      for(const value of ["3.09","129.533333","400","EXISTING-PO"])assert.ok(html.includes(value));
      assert.ok(html.includes(dictionaries[locale]["wms.carton"]));
      assert.ok(!html.includes("4800"));
      assert.ok(html.includes("/sfa/procurement?warehouseId=warehouse&amp;search=EXISTING-PO"));
    }
  });
  test(`missing demand retains insufficient-data explanation without an invented estimate (${locale})`,()=>{
    const html=render(locale,"UNKNOWN",false);
    assert.ok(html.includes(dictionaries[locale]["coverage.undetermined"]));
    assert.ok(html.includes(dictionaries[locale]["coverage.insufficient"]));
    assert.ok(html.includes(dictionaries[locale]["coverage.HISTORY"]));
    assert.ok(!html.includes("3.09"));
  });
}
