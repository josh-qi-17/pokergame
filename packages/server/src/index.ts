import 'dotenv/config';
import { buildApp } from './app.js';

const port = parseInt(process.env['PORT'] ?? '3001', 10);
const host = '0.0.0.0';

const app = await buildApp();

await app.listen({ port, host });
app.log.info(`Server running on http://${host}:${port}`);
