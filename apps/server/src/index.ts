import './load-env.js';
import { serve } from '@hono/node-server';
import { loadEnv } from './env.js';
import { createApp } from './routes/session.js';

const env = loadEnv();
const app = createApp(env);

serve(
  {
    fetch: app.fetch,
    port: env.PORT,
  },
  (info) => {
    console.log(`Server running at http://localhost:${info.port}`);
  },
);
