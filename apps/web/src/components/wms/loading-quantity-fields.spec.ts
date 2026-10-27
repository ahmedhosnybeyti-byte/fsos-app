import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
const ts=require('typescript');
require.extensions['.tsx']=(m:NodeModule,f:string)=>(m as any)._compile(ts.transpileModule(readFileSync(f,'utf8'),{fileName:f,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,f);
const {WmsOperationsPanel}=require('./operations-panel'),{TranslationProvider}=require('../translation-provider');
const {dictionaries}=require('../../lib/i18n/dictionaries');
function render(status='REQUESTED',permissions=['wms.picking.manage']){
 const client=new QueryClient({defaultOptions:{queries:{retry:false,staleTime:Infinity,gcTime:Infinity}}});
 client.setQueryData(['wms','a','w','documents','loads',1,''],{items:[],hasMore:false});
 client.setQueryData(['wms','a','w','load','load'],{id:'load',reference:'TEST',status,version:1,source:'SMART_LOADING',recipientName:'Rep',targetDate:'2098-01-01',minShelfLifeDays:0,lines:[{id:'line',productId:'product',productName:'Water',requestedBase:'25',piecesPerCarton:12,baseUnit:'PIECE'}],allocations:[],events:[]});
 const react=require('react'),original=react.useState,groups=require('../products/product-category-groups'),originalGroups=groups.ProductCategoryGroups;
 react.useState=(initial:any)=>original(initial==='receipts'?'loads':initial);
 groups.ProductCategoryGroups=(props:any)=>createElement(originalGroups,{...props,search:'test-expand'});
 try{return renderToStaticMarkup(createElement(QueryClientProvider,{client},createElement(TranslationProvider,null,createElement(WmsOperationsPanel,{warehouse:'w',company:'a',userId:'keeper',permissions,initialReceiptId:'load',t:(key:string)=>dictionaries.ar[key]}))));}
 finally{react.useState=original;groups.ProductCategoryGroups=originalGroups;client.clear();}
}
test('requested load shows editable cartons and packs inline, initialized to two cartons and one pack',()=>{
 const html=render();assert.match(html,/load-line-cartons/);assert.match(html,/load-line-pieces/);
 assert.match(html,/كرتونة/);assert.match(html,/عبوة/);assert.match(html,/value="2"/);assert.match(html,/value="1"/);assert.match(html,/max="11"/);
 assert.match(html,/تُحفظ الكميات عند تأكيد التجهيز الفعلي بعد الحجز/);
});
test('read-only and accepted documents never expose editable preparation quantities',()=>{
 assert.doesNotMatch(render('REQUESTED',[]),/load-line-cartons|load-line-pieces/);
 assert.doesNotMatch(render('ACCEPTED'),/load-line-cartons|load-line-pieces/);
});
