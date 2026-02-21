import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { generateApi } from 'swagger-typescript-api';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SWAGGER_PATH = resolve(__dirname, '../../api/docs/swagger.json');
const OUTPUT_DIR = resolve(__dirname, '../src/api/generated');

await generateApi({
  name: 'Api.ts',
  input: SWAGGER_PATH,
  output: OUTPUT_DIR,
  httpClientType: 'axios',
  extractEnums: true,
  generateUnionEnums: true,
  unwrapResponseData: true,
  extractRequestParams: true,
  hooks: {
    onFormatTypeName: (typeName) => typeName.replace(/Dto$/, ''),
  },
});

console.log(`API client generated at ${OUTPUT_DIR}`);
