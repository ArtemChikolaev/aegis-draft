-- name: GetSave :one
SELECT kind, payload, rev, schema_version, rating_model_version, updated_at
FROM saves
WHERE user_id = $1 AND kind = $2;

-- name: UpsertSave :one
-- CAS по rev: вставка (rev=1) либо обновление ТОЛЬКО если текущий rev совпал с base_rev.
-- Несовпадение rev → строка не обновляется и RETURNING пуст (:one → ErrNoRows = конфликт).
INSERT INTO saves (user_id, kind, payload, rev, schema_version, rating_model_version, updated_at)
VALUES ($1, $2, $3, 1, $4, $5, now())
ON CONFLICT (user_id, kind) DO UPDATE
SET payload = EXCLUDED.payload,
    rev = saves.rev + 1,
    schema_version = EXCLUDED.schema_version,
    rating_model_version = EXCLUDED.rating_model_version,
    updated_at = now()
WHERE saves.rev = sqlc.arg(base_rev)
RETURNING kind, payload, rev, schema_version, rating_model_version, updated_at;
