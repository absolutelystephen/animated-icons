// Serve a folder for local testing. Usage: node scripts/serve.mjs [folder] [port]
// Default: the assembled site in _site/ on http://127.0.0.1:8000
import { startServer } from './lib/server.mjs';

const root = process.argv[2] || '_site';
const port = Number(process.argv[3] || 8000);
const { url } = await startServer(root, { port });
console.log(`Serving ${root} at ${url}  (Ctrl+C to stop)`);
