# Гостиница «Олимп» — дипломный проект

Сайт гостиницы с бронированием номеров, личным кабинетом и админ-панелью.  
Фронтенд: HTML, CSS, JavaScript. Бэкенд: Node.js, Express, SQLite.

## Быстрый старт (локально)

```bash
npm install
copy deploy\.env.example .env
```

Отредактируйте `.env` (или скопируйте значения из `deploy/.env.example`): `ADMIN_EMAIL` и `ADMIN_PASSWORD` для входа в админку.

```bash
npm start
```

Откройте в браузере: **http://localhost:3000/**  
Не открывайте HTML-файлы напрямую с диска — API работает только через сервер.

| Страница | URL |
|----------|-----|
| Главная | http://localhost:3000/ |
| Вход | http://localhost:3000/login.html |
| Админка | http://localhost:3000/admin.html |

### Администратор

Вход через [login.html](http://localhost:3000/login.html?next=admin.html) (не открывайте `admin.html` без авторизации).

| Поле | По умолчанию |
|------|----------------|
| Email | `forestsorokin338@mail.ru` |
| Пароль | `Shohte12` |

Переопределение: `ADMIN_EMAIL`, `ADMIN_PASSWORD` в `.env`. Пароль синхронизируется при каждом `npm start`.

### Учётная запись для предзащиты

После запуска сервера в базе автоматически есть гость (см. `Server/seed.js`):

| Поле | Значение |
|------|----------|
| Email | `greter12@mail.ru` |
| Пароль | `great123` |
| ФИО | Пётр Зарубин |

Вход: [login.html](http://localhost:3000/login.html) → личный кабинет.

Проверка проекта: `node scripts/audit-check.js` (сервер должен быть запущен).

## Публикация на GitHub и деплой

Инструкции в папке **[deploy/](./deploy/)**:

- [deploy/GITHUB.md](./deploy/GITHUB.md) — отправка на GitHub
- [deploy/RAILWAY.md](./deploy/RAILWAY.md) — хостинг на Railway
- [deploy/README.md](./deploy/README.md) — обзор файлов

## Деплой на хостинг

### Переменные окружения

| Переменная | Описание |
|------------|----------|
| `PORT` | Порт (часто задаёт хостинг) |
| `NODE_ENV` | `production` |
| `CORS_ORIGIN` | Полный URL сайта, например `https://ваш-домен.ru` |
| `ADMIN_EMAIL` | Email администратора (первый запуск) |
| `ADMIN_PASSWORD` | Пароль администратора (первый запуск) |
| `PASSWORD_RESET_EXPOSE_LINK` | `0` на продакшене |
| `DB_PATH` | Путь к SQLite, если нужен постоянный диск |

### Команды на сервере

```bash
npm install --production
npm start
```

Процесс слушает `0.0.0.0` и порт из `PORT`.

### SQLite и данные

База `Server/olymp.db` создаётся при первом запуске и **не хранится в Git**.  
На хостинге с эфемерной файловой системой (бесплатные PaaS) данные могут сбрасываться при перезапуске — для продакшена нужен постоянный том или внешняя БД.

### Railway (рекомендуется)

**[deploy/RAILWAY.md](./deploy/RAILWAY.md)** — деплой из GitHub, Volume для SQLite, переменные окружения.

### Другие платформы

- **VPS** (Timeweb, Selectel, и т.д.) — Node.js + nginx как reverse proxy.
- **Render** — см. [deploy/render.yaml](./deploy/render.yaml).

Пример nginx (прокси на Node):

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

## Структура проекта

```
diplom/
├── index.html, login.html, booking.html, …  # страницы сайта
├── css/, js/, assets/                      # стили, скрипты, изображения
├── Server/
│   ├── Server.js                           # точка входа
│   ├── db.js, seed.js                      # БД и начальные данные
│   └── routes/                             # API
├── deploy/                                 # GitHub, Railway, .env.example
├── scripts/audit-check.js
├── package.json
└── .gitignore
```

## Безопасность

- Не коммитьте `.env` и `Server/olymp.db`.
- На продакшене смените пароль администратора и задайте `PASSWORD_RESET_EXPOSE_LINK=0`.
- Папки `Server/` и `node_modules/` закрыты от прямой раздачи статикой.

## Лицензия

Учебный проект (диплом).
