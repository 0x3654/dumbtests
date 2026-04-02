# топ или боттом?

[![Web](https://github.com/0x3654/dumbtests/actions/workflows/build-web.yml/badge.svg)](https://github.com/0x3654/dumbtests/actions/workflows/build-web.yml)
[![Analyzer](https://github.com/0x3654/dumbtests/actions/workflows/build-analyzer.yml/badge.svg)](https://github.com/0x3654/dumbtests/actions/workflows/build-analyzer.yml)

[![Docker Hub](https://img.shields.io/badge/docker-0x3654-blue?logo=docker)](https://hub.docker.com/u/0x3654)
[![multi-arch](https://img.shields.io/badge/arch-amd64%20%7C%20arm64-green)](https://hub.docker.com/u/0x3654)
[![Last commit](https://img.shields.io/github/last-commit/0x3654/dumbtests)](https://github.com/0x3654/dumbtests/commits/main)

Реальный анализ. Не рандом.

Читает последние 20 твитов, смотрит картинки, использует ИИ. Каждый результат уникален — в отличие от сайтов которые делают `hash(username) % 13`.

**→ [0x3654.com/topbottom](https://0x3654.com/topbottom)**

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
