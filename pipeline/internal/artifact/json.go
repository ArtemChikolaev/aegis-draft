// Package artifact — атомарная запись файлов ETL: raw-кэш источников, промежуточные артефакты
// и игровые JSON. Читатель видит либо прежний файл, либо новый целиком: оборванная запись не
// оставляет усечённый JSON.
package artifact

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

// EncodeJSON — канонический вид JSON-файлов пайплайна: отступ в два пробела и перевод строки
// в конце. Детерминирован: ключи map encoding/json сортирует.
func EncodeJSON(value any) ([]byte, error) {
	body, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return nil, err
	}
	return append(body, '\n'), nil
}

// WriteJSON кодирует value (EncodeJSON) и атомарно пишет в path.
func WriteJSON(path string, value any) error {
	body, err := EncodeJSON(value)
	if err != nil {
		return err
	}
	return WriteFile(path, body)
}

// WriteFile атомарно заменяет path содержимым body: temp-файл в том же каталоге, fsync, rename.
func WriteFile(path string, body []byte) error {
	if path == "" {
		return fmt.Errorf("artifact path is required")
	}
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(dir, ".artifact-*.tmp")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	defer os.Remove(tmpPath)
	if err := tmp.Chmod(0o644); err != nil {
		tmp.Close()
		return err
	}
	if _, err := tmp.Write(body); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Sync(); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmpPath, path)
}
