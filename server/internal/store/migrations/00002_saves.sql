-- Облачные сейвы (T8.4). Сервер хранит НЕПРОЗРАЧНЫЙ клиентский стейт (payload) и
-- версии — совместимость решает клиент; ре-симуляции тут нет (это T8.5 анти-чит).
-- Один blob на пару (user × kind): kind = 'run' | 'career'. Оптимистичная запись —
-- монотонный rev: клиент шлёт известный rev, сервер отвергает устаревшую запись (409).

-- +goose Up
CREATE TABLE saves (
    user_id              uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    kind                 text NOT NULL,             -- 'run' | 'career'
    payload              jsonb NOT NULL,            -- непрозрачный клиентский стейт
    rev                  bigint NOT NULL DEFAULT 1, -- ++ на каждую запись (CAS-guard)
    schema_version       text NOT NULL DEFAULT '',  -- версии клиента на момент записи
    rating_model_version text NOT NULL DEFAULT '',
    updated_at           timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, kind)
);

-- +goose Down
DROP TABLE saves;
