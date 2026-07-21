/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Базовый URL Go API (динамика: аккаунты/сейвы). Пусто = сервер не сконфигурен,
   *  приложение работает локально/анонимно. Задаётся на сборке, когда поднимется Fly. */
  readonly VITE_API_BASE?: string;
}
