import "dotenv/config";
import "reflect-metadata";
import { randomUUID, createHash } from "node:crypto";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { AppModule } from "./app.module";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";
import { AppConfigService } from "./common/config";
import { API_VERSION_PREFIX } from "@field-sales-os/schemas";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: false });
  const config = app.get(AppConfigService).values;

  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: config.app.corsOrigins,
    credentials: true,
  });

  // Diagnostic only: traces every request that actually reaches Express, for
  // every path, before any Nest guard/pipe/controller runs — this is what
  // proves whether a request from ChatGPT reached this server at all versus
  // failing earlier (Action runtime or reverse proxy). Each line carries a
  // requestId (also echoed as an X-Request-Id response header) so it can be
  // correlated against ngrok's own inspector (http://127.0.0.1:4040) or any
  // other upstream trace. The Authorization header is never logged in the
  // clear — only a short SHA-256 prefix, enough to confirm two requests used
  // the same credential without ever persisting the credential itself.
  const requestTraceLogger = new Logger("RequestTrace");
  app.use((req: import("express").Request, res: import("express").Response, next: () => void) => {
    const requestId = randomUUID();
    res.setHeader("X-Request-Id", requestId);
    const auth = req.headers.authorization;
    const authHash = auth ? createHash("sha256").update(auth).digest("hex").slice(0, 12) : "none";
    const start = Date.now();

    requestTraceLogger.log(
      `IN  id=${requestId} ${req.method} ${req.originalUrl} authHash=${authHash} at=${new Date().toISOString()}`,
    );
    res.on("finish", () => {
      requestTraceLogger.log(`OUT id=${requestId} ${req.method} ${req.originalUrl} status=${res.statusCode} ${Date.now() - start}ms`);
    });

    next();
  });

  app.setGlobalPrefix(`api/${API_VERSION_PREFIX}`);
  app.useGlobalFilters(new HttpExceptionFilter());

  // Full internal API reference — every module, cookie + bearer auth shown.
  const swaggerConfig = new DocumentBuilder()
    .setTitle("Field Sales OS API")
    .setDescription("Access-control and data API backing the Field Sales OS platform and its Custom GPT Actions")
    .setVersion("1.0")
    .addBearerAuth({ type: "http", scheme: "bearer", bearerFormat: "GPT API Key" }, "gpt-api-key")
    .addCookieAuth("fso_access_token")
    .addServer("https://obtain-boneless-osmosis.ngrok-free.dev") 
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup("docs", app, document);

  // Minimal OpenAPI document scoped to ONLY the endpoints a Custom GPT
  // Action should ever see (verify-access, datasets list, dataset fetch,
  // render) — this is what gets pasted into the GPT Builder's Action
  // schema, not the full /docs above. See docs/GPT_SETUP.md.
  const gptActionPaths = [
    `/api/${API_VERSION_PREFIX}/gpt/verify-access`,
    `/api/${API_VERSION_PREFIX}/gpt/datasets`,
    `/api/${API_VERSION_PREFIX}/gpt/dataset`,
    `/api/${API_VERSION_PREFIX}/gpt/render`,
  ];
  const { cookie: _cookie, ...gptActionSecuritySchemes } = document.components?.securitySchemes ?? {};
  // The GPT Builder Action importer requires a genuine OpenAPI 3.1.x
  // document. @nestjs/swagger itself always generates 3.0-shaped output
  // (`document.openapi` is "3.0.0"), so this override is only safe because
  // every schema on these 4 paths is hand-authored in GptController using
  // JSON-Schema-2020-12 syntax (`type` arrays for nullability, not
  // `nullable: true`) specifically for 3.1 compatibility — see
  // jsonSchema31() there. Do not add auto-inferred/undecorated schemas to
  // these paths without converting them the same way, or this label will
  // lie again.
  const gptActionsDocument = {
    ...document,
    openapi: "3.1.0",
    info: {
      ...document.info,
      title: "Field Sales OS - GPT Action",
      description: "Scoped schema for the Custom GPT Action integration. Import this into the GPT Builder, not /docs-json.",
    },
    paths: Object.fromEntries(Object.entries(document.paths).filter(([path]) => gptActionPaths.includes(path))),
    components: {
      ...document.components,
      securitySchemes: gptActionSecuritySchemes,
    },
  };
  SwaggerModule.setup("docs/gpt-actions", app, gptActionsDocument);

  await app.listen(config.app.port);
  // eslint-disable-next-line no-console
  console.log(`Field Sales OS API listening on ${config.app.apiUrl}`);
  // eslint-disable-next-line no-console
  console.log(`Full API docs:        ${config.app.apiUrl}/docs`);
  // eslint-disable-next-line no-console
  console.log(`GPT Action schema:    ${config.app.apiUrl}/docs/gpt-actions-json`);
}

bootstrap();
