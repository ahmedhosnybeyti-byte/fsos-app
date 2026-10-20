// Test-only TypeScript/decorator support using the already installed compiler.
// Each spec runs in a separate process. Never preload this in the application.
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const Module = require('node:module');
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...options) {
  if (request.startsWith('@/')) {
    const app = parent?.filename?.replaceAll('\\', '/').includes('/apps/web/') ? 'web' : 'api';
    request = path.resolve('apps', app, 'src', request.slice(2));
  }
  return originalResolve.call(this, request, parent, ...options);
};

// Do not inherit real credentials, NODE_OPTIONS, proxies or database endpoints.
const allowed = /^(PATH|SYSTEMROOT|WINDIR|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|COMSPEC|PATHEXT|HOME|RIE_TEST_PGLITE_MODULE|NODE_TEST_CONTEXT)$/i;
for (const key of Object.keys(process.env)) if (!allowed.test(key)) delete process.env[key];
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:1/quality_never_connect';

// Existing tests replace fetch with explicit fakes. Accidental real I/O fails.
globalThis.fetch = async () => { throw new Error('Quality tests require mocked fetch'); };
require('node:net').Socket.prototype.connect = function () {
  throw new Error('Quality tests forbid network/database connections');
};
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(
  fs.readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
      experimentalDecorators: true, emitDecoratorMetadata: true,
      esModuleInterop: true, resolveJsonModule: true,
    },
  },
).outputText, filename);
require(require.resolve('reflect-metadata', { paths: [path.resolve('apps/api')] }));
