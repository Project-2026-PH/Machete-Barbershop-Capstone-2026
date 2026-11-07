/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  // Optional: leave unset in hosted deployments so the frontend calls its
  // own origin and relies on the Vercel same-origin API proxy (see
  // demoshop-frontend/vercel.ts). Only set this for local development setups
  // that bypass the Vite dev-server proxy in vite.config.js.
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module 'zxcvbn';
