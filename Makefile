# Dev-запуск фронта (web/). Один Vite-процесс: --host открывает и localhost, и LAN.
# Два порта не нужны — с телефона заходите по IP, с компа по localhost (один и тот же :5173).

WEB := web
PORT := 5173
# Отметка последней установки зависимостей; живёт в node_modules и пропадает вместе с ним.
STAMP := node_modules/.install-stamp

.PHONY: help deps dev dev-phone dev-all

help:
	@echo "make dev       — только комп:  http://localhost:$(PORT)/"
	@echo "make dev-phone — телефон (+ комп): LAN + localhost на :$(PORT)"
	@echo "make dev-all   — то же, что dev-phone (один сервер на оба устройства)"
	@echo ""
	@echo "Телефон и Mac в одной Wi-Fi. URL для Safari Vite печатает как Network: …"

# npm install только когда он что-то изменит: node_modules ещё не ставился через make или
# package.json / package-lock.json новее отметки прошлой установки. Раньше install шёл на каждом
# старте dev и тратил секунды на проверку уже установленного.
deps:
	@cd $(WEB) && if [ ! -f $(STAMP) ] || [ package.json -nt $(STAMP) ] || [ package-lock.json -nt $(STAMP) ]; then \
		npm install && mkdir -p node_modules && touch $(STAMP); \
	fi

dev: deps ## только localhost (как npm install && npm run dev)
	cd $(WEB) && npm run dev

dev-phone: deps ## доступ с телефона и с компа (vite --host)
	@IP=$$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true); \
	echo ""; \
	echo "  Desktop → http://localhost:$(PORT)/"; \
	if [ -n "$$IP" ]; then echo "  Phone   → http://$$IP:$(PORT)/"; else echo "  Phone   → http://<your-lan-ip>:$(PORT)/  (ipconfig getifaddr en0)"; fi; \
	echo ""; \
	cd $(WEB) && npm run dev:lan

# Явный алиас: «и туда, и туда» = один Vite с --host, не два порта.
dev-all: dev-phone
