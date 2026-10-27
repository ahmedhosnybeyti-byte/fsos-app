import assert from "node:assert/strict";
import test from "node:test";
import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import { ExpressAdapter } from "@nestjs/platform-express";
import { configureSupplierDocumentJson } from "./supplier-document-json";

const path = "/api/v1/sfa/wms/warehouses/synthetic/commands";
async function parse(body: string, url = path, contentType = "application/json") {
  const adapter = new ExpressAdapter();
  configureSupplierDocumentJson({
    useBodyParser: (type: any, options: any) => adapter.useBodyParser(type, false, options),
    use: (...args: any[]) => adapter.use(...args),
  } as any);
  const socket = new Socket(), req = new IncomingMessage(socket), res = new ServerResponse(req);
  req.method = "POST"; req.url = url;
  req.headers = { "content-type": contentType, "content-length": String(Buffer.byteLength(body)) };
  try {
    return await new Promise<{body?: any; error?: any}>((resolve, reject) => {
      adapter.getInstance().use((request: any, _response: any) => resolve({ body: request.body }));
      adapter.getInstance().use((error: any, _request: any, _response: any, _next: any) => resolve({ error }));
      adapter.getInstance().handle(req, res, (error: any) => error ? reject(error) : reject(new Error("Parser did not handle fixture")));
      req.push(Buffer.from(body)); req.push(null);
    });
  } finally { socket.destroy(); }
}

test("supplier document JSON admits all 21/83/1000 lines through the real parser without a numerical item cap", async () => {
  for (const count of [21, 83, 1000]) {
    const lines = Array.from({length:count},(_,i)=>({productId:`synthetic-${i}`,expectedQuantity:"29",acceptedQuantity:"26",quarantinedQuantity:"2",rejectedQuantity:"1",rejectionReason:"Isolated inspection"}));
    for (const operation of ["receipt.create","receipt.edit","supplier.create"]) {
      const result = await parse(JSON.stringify({operation,input:{lines}}));
      assert.equal(result.error,undefined); assert.equal(result.body.input.lines.length,count);
    }
  }
});

test("larger supplier envelopes do not widen other route or Smart Loading command limits", async () => {
  const padding="x".repeat(101*1024);
  for(const operation of ["load.create","proposal.create","rep-return.create"]){
    const result=await parse(JSON.stringify({operation,input:{padding}}));
    assert.equal(result.error?.getStatus(),413);
  }
  const other=await parse(JSON.stringify({padding}),"/api/v1/smart-loading/session");
  assert.equal(other.error?.status,413);
  const small=await parse('{"unchanged":true}',"/api/v1/unchanged");
  assert.deepEqual(small.body,{unchanged:true});
});

test("supplier transport keeps a finite byte budget and safe malformed-JSON errors", async () => {
  const oversized=await parse(JSON.stringify({operation:"receipt.create",padding:"x".repeat(10*1024*1024)}));
  assert.equal(oversized.error?.getStatus(),413);
  const malformed=await parse('{"operation":');
  assert.equal(malformed.error?.getStatus(),400);
});
