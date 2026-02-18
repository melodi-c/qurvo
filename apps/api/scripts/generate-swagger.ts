import 'reflect-metadata';
import { resolve } from 'path';
import { writeFileSync, mkdirSync } from 'fs';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

// Import from compiled dist — nest build applies the swagger plugin
// which decorates DTOs with metadata for proper schema generation
import { AppModule } from '../dist/app.module';
import { DRIZZLE } from '../dist/providers/drizzle.provider';
import { CLICKHOUSE } from '../dist/providers/clickhouse.provider';
import { REDIS } from '../dist/providers/redis.provider';

async function generate() {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(DRIZZLE)
    .useValue({})
    .overrideProvider(CLICKHOUSE)
    .useValue({})
    .overrideProvider(REDIS)
    .useValue({})
    .useMocker(() => ({}))
    .compile();

  const app = moduleRef.createNestApplication();
  await app.init();

  const config = new DocumentBuilder()
    .setTitle('Shot Analytics API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config, {
    deepScanRoutes: true,
  });

  const outDir = resolve(__dirname, '..', 'docs');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    resolve(outDir, 'swagger.json'),
    JSON.stringify(document, null, 2),
  );

  console.log('Swagger spec written to docs/swagger.json');
  await app.close();
}

generate().catch((err) => {
  console.error(err);
  process.exit(1);
});
