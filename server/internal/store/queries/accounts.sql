-- name: GetIdentity :one
SELECT * FROM identities
WHERE provider = $1 AND provider_uid = $2;

-- name: GetUserByID :one
SELECT * FROM users
WHERE id = $1;

-- name: CreateUser :one
INSERT INTO users DEFAULT VALUES
RETURNING *;

-- name: CreateIdentity :one
INSERT INTO identities (user_id, provider, provider_uid, username)
VALUES ($1, $2, $3, $4)
RETURNING *;
