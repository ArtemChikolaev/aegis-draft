-- Аккаунты aegis-draft (T8.2, срез M9 «аккаунты»).
-- users.id — ЛИЧНОСТЬ пользователя приложения; это НЕ игровой accountId (тот в schema/
-- про players/heroes, OpenDota). Провайдеры входа (telegram/google/steam) — в identities;
-- «любой один способ» из ADR 0002 (2026-07-20) выражается как ≥1 строка identities на users.
-- gen_random_uuid()/now() — встроены в Postgres 13+ (в проде PG16), pgcrypto не нужен.

-- +goose Up
CREATE TABLE users (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE identities (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    provider     text NOT NULL,          -- 'telegram' | 'google' | 'steam' | …
    provider_uid text NOT NULL,          -- id у провайдера (tg user id, google sub, steamid64)
    username     text NOT NULL DEFAULT '', -- минимум профиля; '' если провайдер не дал
    created_at   timestamptz NOT NULL DEFAULT now(),
    UNIQUE (provider, provider_uid)       -- одна внешняя личность — один аккаунт
);

CREATE INDEX identities_user_id_idx ON identities (user_id);

-- +goose Down
DROP TABLE identities;
DROP TABLE users;
