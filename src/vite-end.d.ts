/// <reference types="vite/client" />
declare const GITHUB_RUNTIME_PERMANENT_NAME: string
declare const BASE_KV_SERVICE_URL: string

interface ImportMetaEnv {
  readonly VITE_OPENAI_BASE_URL?: string
  readonly VITE_OPENAI_API_KEY?: string
  readonly VITE_AI_API_KEY?: string
  readonly VITE_OPENAI_MODEL?: string
  readonly VITE_AI_MODEL?: string
  readonly ai_base_url?: string
  readonly ai_api_key?: string
  readonly ai_model?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
