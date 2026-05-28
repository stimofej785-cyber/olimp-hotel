# Деплой на Railway

Пошаговая инструкция после того, как проект уже в GitHub.

## 1. Регистрация и проект

1. Откройте [railway.app](https://railway.app) и войдите через **GitHub**.
2. **New Project** → **Deploy from GitHub repo**.
3. Выберите репозиторий `diplom` (или как назвали).
4. Railway сам определит Node.js и выполнит `npm install` + `npm start`.

## 2. Переменные окружения

В проекте Railway: **Variables** → добавьте:

| Переменная | Значение |
|------------|----------|
| `NODE_ENV` | `production` |
| `ADMIN_EMAIL` | ваш email для админки |
| `ADMIN_PASSWORD` | надёжный пароль |
| `PASSWORD_RESET_EXPOSE_LINK` | `0` |
| `CORS_ORIGIN` | URL Railway (см. ниже) |

`PORT` Railway задаёт сам — **не переопределяйте**.

### CORS_ORIGIN

После первого деплоя откройте **Settings** → **Networking** → **Generate Domain**.  
Скопируйте URL, например `https://diplom-production-xxxx.up.railway.app`, и вставьте в `CORS_ORIGIN` **без слэша в конце**.

Перезапустите деплой: **Deployments** → три точки → **Redeploy**.

## 3. Постоянная база данных (Volume)

Без тома SQLite сбрасывается при каждом перезапуске.

1. В проекте: **+ New** → **Volume**.
2. Подключите Volume к сервису с сайтом.
3. Mount path: `/data`
4. Добавьте переменную:

```
DB_PATH=/data/olymp.db
```

5. Redeploy.

При первом запуске создастся БД и администратор (если заданы `ADMIN_EMAIL` и `ADMIN_PASSWORD`).

## 4. Проверка

- `https://ВАШ-ДОМЕН.up.railway.app/api/health` → `{"ok":true,...}`
- Главная: `https://ВАШ-ДОМЕН.up.railway.app/`
- Админка: `.../admin.html` (логин из `ADMIN_EMAIL` / `ADMIN_PASSWORD`)

## 5. Свой домен (опционально)

**Settings** → **Networking** → **Custom Domain** — укажите домен и обновите `CORS_ORIGIN` на новый URL.

## Частые проблемы

| Проблема | Решение |
|----------|---------|
| Сайт открывается, API не работает | Открывайте только URL Railway, не файлы с диска |
| CORS / вход не работает | `CORS_ORIGIN` = точный URL сайта на Railway |
| Админ не создаётся | Задать `ADMIN_PASSWORD`, сделать Redeploy на чистой БД |
| Данные пропадают | Подключить Volume и `DB_PATH=/data/olymp.db` |
