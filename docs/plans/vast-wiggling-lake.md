# CI/CD: GitHub Actions → Docker Hub → Watchtower

## Context

Нужен автоматический деплой бэкенда: при пуше в `main` собирается Docker-образ, пушится в Docker Hub, Watchtower на сервере подхватывает новый образ и перезапускает контейнер.

## Что создаём

### 1. GitHub Actions workflow — `.github/workflows/deploy-backend.yml`

- **Триггер**: push в `main`, только при изменениях в `backend/**`
- **Шаги**:
  1. Checkout кода
  2. Login в Docker Hub (`docker/login-action`)
  3. Build + push образа (`docker/build-push-action`)
     - Контекст: `./backend`
     - Теги: `${{ secrets.DOCKERHUB_USERNAME }}/uzgidrochat-backend:latest` + `:sha-<short>`
  4. Docker layer caching через `cache-from`/`cache-to` (GitHub Actions cache)

- **Секреты** (настроить в GitHub → Settings → Secrets):
  - `DOCKERHUB_USERNAME`
  - `DOCKERHUB_TOKEN`

### 2. Обновить `docker-compose.yml` на сервере

Заменить `build: ./backend` на `image: <dockerhub-user>/uzgidrochat-backend:latest`, чтобы Watchtower следил за образом из реестра.

Также добавить label `com.centurylinklabs.watchtower.enable=true` на бэкенд-сервис (опционально, если Watchtower не мониторит все контейнеры).

### 3. Создать `docker-compose.prod.yml` — продакшн-версия

Отдельный compose-файл для сервера, где backend берётся из Docker Hub, а не билдится локально. Это позволяет сохранить текущий `docker-compose.yml` для локальной разработки.

## Файлы

| Файл | Действие |
|------|----------|
| `.github/workflows/deploy-backend.yml` | Создать |
| `docker-compose.prod.yml` | Создать |

## Верификация

1. Проверить workflow синтаксис: `actionlint` или визуально в GitHub
2. После пуша в main — проверить вкладку Actions в GitHub
3. Проверить что образ появился на Docker Hub
4. На сервере: `docker-compose -f docker-compose.prod.yml pull` — образ обновляется
5. Watchtower автоматически подхватывает новый образ (проверить логи: `docker logs watchtower`)
