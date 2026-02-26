// eslint-disable-next-line @typescript-eslint/no-require-imports
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio');
import { registerTools } from './tools';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const server = new McpServer({ name: 'qurvo', version: '0.1.0' }) as any;

registerTools(server);

const transport = new StdioServerTransport();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
server.connect(transport).catch((err: any) => {
  process.stderr.write(`Fatal: failed to connect MCP transport: ${String(err)}\n`);
  process.exit(1);
});
