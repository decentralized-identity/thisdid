/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL for the resolver API. Empty = same-origin (Worker-served SPA). */
  readonly VITE_API_BASE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
