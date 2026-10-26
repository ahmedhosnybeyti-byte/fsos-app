import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { dictionaries } from "../../lib/i18n/dictionaries";

const ts=require("typescript");
require.extensions[".tsx"]=(m:NodeModule,f:string)=>(m as any)._compile(ts.transpileModule(readFileSync(f,"utf8"),{
  fileName:f,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true},
}).outputText,f);
const {SmartLoadingWarehouseBridge}=require("./smart-loading-bridge");
const {TranslationProvider}=require("../translation-provider");
const buttons=require("../ui/button");

function render(mode?:string,permissions=["sfa.access","wms.read","wms.request.create"],options:{company?:string;modeCompany?:string;feature?:string;requestDisabled?:boolean;modeError?:boolean;onExport?:()=>Promise<void>}={}){
  const client=new QueryClient({defaultOptions:{queries:{retry:false,refetchOnMount:false,staleTime:Infinity,gcTime:Infinity}}});
  const company=options.company??"a";
  client.setQueryData(["auth","me"],{companyId:company,role:{code:"SALES_REP"},permissions,featureAccess:{"warehouse-core":options.feature??"ENABLED"}});
  if(mode)client.setQueryData(["sfa-mode",options.modeCompany??company],{operatingMode:mode});
  if(options.modeError)client.getQueryCache().find({queryKey:["sfa-mode",company]})!.setState({status:"error",error:new Error("mode unavailable")});
  let action:any;
  const original=buttons.Button;
  buttons.Button=(props:any)=>{action??=props;return createElement("button",props);};
  try{
    const html=renderToStaticMarkup(createElement(QueryClientProvider,{client},createElement(TranslationProvider,null,createElement(SmartLoadingWarehouseBridge,{
      proposals:[{productCode:"P-12",productName:"Product",quantity:2}],targetDate:"2026-10-25",onExport:options.onExport??(async()=>{}),requestDisabled:options.requestDisabled,
    }))));
    return {html,action,queries:client.getQueryCache().getAll().map(q=>q.queryKey)};
  }finally{buttons.Button=original;client.clear();}
}

for(const mode of ["ANALYSIS_ONLY","SFA"]){
  test(`${mode} exports with existing callback, needs no WMS permission and makes no warehouse read`,async()=>{
    let calls=0;
    const {html,action,queries}=render(mode,[],{feature:"HIDDEN",onExport:async()=>{calls++;}});
    assert.match(html,/تصدير أمر التحميل Excel/);assert.equal(action.disabled,false);
    await action.onClick();assert.equal(calls,1);
    assert.ok(queries.every(q=>q[0]!=="wms"));assert.doesNotMatch(html,/إرسال إلى المستودع/);
  });
}
test("FULL_ERP exposes warehouse action and never invokes Excel",async()=>{
  let exports=0;const {html,action,queries}=render("FULL_ERP",undefined,{onExport:async()=>{exports++;}});
  assert.match(html,/إرسال إلى المستودع/);assert.equal(action.disabled,false);
  await action.onClick();assert.equal(exports,0);assert.ok(queries.every(q=>q[0]!=="wms"));
});
test("FULL_ERP rep can request without warehouse permissions; feature/SFA admission and applied-quantity boundary remain enforced",()=>{
  for(const company of ["a","b"])assert.equal(render("FULL_ERP",["sfa.access"],{company}).action.disabled,false);
  assert.equal(render("FULL_ERP",[]).action.disabled,true);
  assert.equal(render("FULL_ERP",undefined,{feature:"HIDDEN"}).action.disabled,true);
  assert.equal(render("FULL_ERP",undefined,{requestDisabled:true}).action.disabled,true);
});
test("unknown, failed or another company's mode cannot enable either action",()=>{
  assert.equal(render().action.disabled,true);
  assert.equal(render("FULL_ERP",undefined,{modeError:true}).action.disabled,true);
  assert.equal(render("FULL_ERP",undefined,{company:"b",modeCompany:"a"}).action.disabled,true);
});
test("a rapid double-click calls Excel once while export is pending; retry remains possible",async()=>{
  let finish!:()=>void,calls=0;
  const {action}=render("SFA",[],{onExport:()=>{calls++;return new Promise<void>(resolve=>{finish=resolve;});}});
  action.onClick();action.onClick();assert.equal(calls,1);
  finish();await new Promise(resolve=>setImmediate(resolve));
  action.onClick();assert.equal(calls,2);finish();
});
test("new action labels are available in Arabic and English",()=>{
  assert.equal(dictionaries.ar["smartLoading.exportLoadingOrderExcel"],"تصدير أمر التحميل Excel");
  assert.equal(dictionaries.en["smartLoading.exportLoadingOrderExcel"],"Export loading order Excel");
  assert.equal(dictionaries.en["smartLoading.sendToWarehouse"],"Send to warehouse");
});

function requestForm(proposals:{productCode:string;productName:string;quantity:number}[]){
  const Module=require('node:module'),path=require('node:path'),react=require('react'),query=require('@tanstack/react-query');
  const file=path.resolve('apps/web/src/components/wms/smart-loading-bridge.tsx'),loaded=new Module(file,module);
  loaded.filename=file;loaded.paths=module.paths;
  const calls:any[]=[];
  const states=['warehouse',1,'','',true,false,{idempotencyKey:crypto.randomUUID(),proposalKey:crypto.randomUUID()}];let index=0;
  const realRequire=loaded.require.bind(loaded);
  loaded.require=(name:string)=>name==='react'?{...react,useState:()=>[states[index++],()=>{}],useRef:()=>({current:false})}:name==='@tanstack/react-query'?{...query,
    useQuery:()=>({data:{items:[],hasMore:false},isPending:false,isError:false,isFetching:false}),
    useMutation:()=>({isPending:false,isSuccess:false,isError:false,mutate:(body:any)=>calls.push(body)}),
  }:realRequire(name);
  loaded._compile(ts.transpileModule(readFileSync(file,'utf8'),{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText+'\nexports.RequestForm=RequestForm;',file);
    const form=loaded.exports.RequestForm({company:'a',userId:'rep',proposals,targetDate:'2098-01-01',t:(key:keyof typeof dictionaries.ar)=>dictionaries.ar[key],onBusyChange:()=>{}});
    function find(node:any,predicate:(n:any)=>boolean):any {if(!node||typeof node!=='object')return;if(predicate(node))return node;for(const child of [node.props?.children].flat(Infinity)){const match=find(child,predicate);if(match)return match;}}
    return {form,calls,submit:find(form,n=>n.type===buttons.Button&&n.props.type==='submit')};
}
for(const count of [2,20,40,1000])test(`warehouse send submits every one of ${count} order products once, without product selection`,()=>{
 const proposals=Array.from({length:count},(_,i)=>({productCode:`P-${i}`,productName:`Product ${i}`,quantity:i+1}));
 const view=requestForm(proposals);assert.equal(view.submit.props.disabled,false);
 view.form.props.onSubmit({preventDefault(){}});view.form.props.onSubmit({preventDefault(){}});
 assert.equal(view.calls.length,1);assert.deepEqual(view.calls[0].lines,proposals.map(p=>({productCode:p.productCode,quantity:`${p.quantity}.00`,unit:'CARTON'})));
});
test('warehouse send normalizes recurring-decimal recommendations without omitting a positive order line',()=>{
 const proposals=[{productCode:'P-1',productName:'Valid',quantity:1},{productCode:'P-2',productName:'Recurring demand',quantity:1.1234567}];
 const view=requestForm(proposals);
 assert.equal(view.submit.props.disabled,false);view.form.props.onSubmit({preventDefault(){}});
 assert.equal(view.calls.length,1);assert.deepEqual(view.calls[0].lines,[{productCode:'P-1',quantity:'1.00',unit:'CARTON'},{productCode:'P-2',quantity:'1.12',unit:'CARTON'}]);
});
test('warehouse send combines case-variant duplicate product codes without dropping their quantities',()=>{
 const view=requestForm([{productCode:'P-1',productName:'Product',quantity:2},{productCode:'p-1',productName:'Product',quantity:3}]);
 assert.equal(view.submit.props.disabled,false);view.form.props.onSubmit({preventDefault(){}});
 assert.deepEqual(view.calls[0].lines,[{productCode:'P-1',quantity:'5.00',unit:'CARTON'}]);
});
test('warehouse send preserves a tiny positive quantity instead of rounding it into zero',()=>{
 const view=requestForm([{productCode:'P-1',productName:'Too small to represent',quantity:0.01}]);
 assert.equal(view.submit.props.disabled,false);view.form.props.onSubmit({preventDefault(){}});assert.deepEqual(view.calls[0].lines,[{productCode:'P-1',quantity:'0.01',unit:'CARTON'}]);
});
test('warehouse send keeps a sub-cent positive recommendation valid with two decimal places',()=>{
 const view=requestForm([{productCode:'P-1',productName:'Below one hundredth',quantity:0.004}]);
 assert.equal(view.submit.props.disabled,false);view.form.props.onSubmit({preventDefault(){}});
 assert.deepEqual(view.calls[0].lines,[{productCode:'P-1',quantity:'0.01',unit:'CARTON'}]);
});
test('final review shows every line with its serialized carton quantity and has no 20-item UI cap',()=>{
 const source=readFileSync('apps/web/src/components/wms/smart-loading-bridge.tsx','utf8');
 assert.match(source,/smartLoading\.finalLoadingReview/);assert.match(source,/ProductCategoryGroups items=\{eligible\}/);
  assert.match(source,/lines\[index\]!\.quantity/);assert.doesNotMatch(source,/proposalPage|slice\(\(proposalPage-1\)\*20|completeOrder/);
});
