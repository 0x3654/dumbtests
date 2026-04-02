# Глупенькие тесты

[![Web](https://github.com/0x3654/dumbtests/actions/workflows/build-web.yml/badge.svg)](https://github.com/0x3654/dumbtests/actions/workflows/build-web.yml)
[![Analyzer](https://github.com/0x3654/dumbtests/actions/workflows/build-analyzer.yml/badge.svg)](https://github.com/0x3654/dumbtests/actions/workflows/build-analyzer.yml)

[![Docker Hub](https://img.shields.io/badge/docker-0x3654-blue?logo=docker)](https://hub.docker.com/u/0x3654)
[![multi-arch](https://img.shields.io/badge/arch-amd64%20%7C%20arm64-green)](https://hub.docker.com/u/0x3654)
[![Last commit](https://img.shields.io/github/last-commit/0x3654/dumbtests)](https://github.com/0x3654/dumbtests/commits/main)

## Топ или боттом?
Реальный анализ. Не рандом.
Читает последние 20 твитов, смотрит картинки, использует ИИ. Каждый результат уникален и кешируется на 7 дней.

**→ [0x3654.com/topbottom](https://0x3654.com/topbottom)**

<p>
  <img src="docs/screenshot.png" alt="elonmusk" width="280">
  <img src="docs/screenshot-obama.png" alt="barackobama" width="280">
  <img src="docs/screenshot-trump.png" alt="realdonaldtrump" width="280">
  <img src="docs/screenshot-nasa.png" alt="nasa" width="280">
  <img src="docs/screenshot-rihanna.png" alt="rihanna" width="280">
</p>

---

## Как работает

1. Вводишь ник — сервис читает последние 20 твитов через Twitter GraphQL API
2. Картинки из твитов описываются через vision-модель
3. Всё это скармливается LLM с промтом, который определяет роль из 13 вариантов
4. Результат кешируется в Redis — повторный запрос мгновенный

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/architecture-dark.png">
  <img src="docs/architecture-light.png" alt="architecture">
</picture>

## Стек

| | |
|---|---|
| Фронт | Next.js 15, TypeScript |
| Бэкенд | Python, FastAPI |
| Кэш | Redis |
| AI | GLM-4V (vision + текст) |
| Twitter | внутренний GraphQL API (cookies) |
| Деплой | Docker Compose, nginx |

## Экран недоступности

<img src="docs/crash.png" alt="сервис недоступен" width="280">

Показывается когда:
- аналайзер не отвечает (`unavailable`)
- закончился баланс AI API (`no_funds`)
- не задан API ключ (`no_key`)

---

## Twitter cookies (Safari на Mac)

Без cookies сервис не может читать твиты. Нужны два значения из браузера:

1. Открой [x.com](https://x.com) и залогинься
2. В меню: **Develop → Show Web Inspector** (если нет — включи в Safari → Settings → Advanced → Show Develop menu)
3. Вкладка **Storage → Cookies → https://x.com**
4. Найди и скопируй:
   - `auth_token` → `TWITTER_AUTH_TOKEN` в `.env`
   - `ct0` → `TWITTER_CT0` в `.env`

> Cookies привязаны к сессии. Если выйдешь из аккаунта — нужно обновить.

---

## Запуск локально

```bash
cp .env.example .env
# заполни TWITTER_AUTH_TOKEN, TWITTER_CT0, AI_API_KEY

docker compose up -d
# → http://localhost:3001/topbottom
```

## Структура

```
src/
  web/       — Next.js фронт
  analyzer/  — Python сервис
compose.yaml
```

## Роли

13 вариантов от `100% top` до `100% bottom` включая `power top`, `bratty bottom`, `pillow princess`, `doesn't have sex` и другие.

---

*не связан с x/twitter*
