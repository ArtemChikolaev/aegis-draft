# Dev-запуск фронта (web/). Один Vite-процесс: --host открывает и localhost, и LAN.
# Два порта не нужны — с телефона заходите по IP, с компа по localhost (один и тот же :5173).

WEB := web
PORT := 5173

.PHONY: help dev dev-phone dev-all

help:
	@echo "make dev       — только комп:  http://localhost:$(PORT)/"
	@echo "make dev-phone — телефон (+ комп): LAN + localhost на :$(PORT)"
	@echo "make dev-all   — то же, что dev-phone (один сервер на оба устройства)"
	@echo ""
	@echo "Телефон и Mac в одной Wi-Fi. URL для Safari Vite печатает как Network: …"

dev: ## только localhost (как npm install && npm run dev)
	cd $(WEB) && npm install && npm run dev

dev-phone: ## доступ с телефона и с компа (vite --host)
	@IP=$$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true); \
	echo ""; \
	echo "  Desktop → http://localhost:$(PORT)/"; \
	if [ -n "$$IP" ]; then echo "  Phone   → http://$$IP:$(PORT)/"; else echo "  Phone   → http://<your-lan-ip>:$(PORT)/  (ipconfig getifaddr en0)"; fi; \
	echo ""; \
	cd $(WEB) && npm install && npm run dev:lan

# Явный алиас: «и туда, и туда» = один Vite с --host, не два порта.
dev-all: dev-phone
