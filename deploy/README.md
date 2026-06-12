# Деплой и публикация

Всё, что относится к хостингу и GitHub, собрано в этой папке.

| Файл | Назначение |
|------|------------|
| [GITHUB.md](./GITHUB.md) | Как отправить проект на GitHub |
| [RAILWAY.md](./RAILWAY.md) | Деплой на Railway |
| [railway.toml](./railway.toml) | Конфиг Railway (опционально) |
| [render.yaml](./render.yaml) | Пример для Render.com |
| [.env.example](./.env.example) | Шаблон переменных окружения |

## Локальный запуск

Из **корня** проекта:

```powershell
copy deploy\.env.example .env
npm install
npm start
```

Файл `.env` должен лежать в корне — его подхватывает `Server/Server.js`.

## Railway и `railway.toml`

Railway автоматически читает `railway.toml` только из **корня** репозитория.  
Деплой работает и без него: в корне есть `package.json` с `"start": "node Server/Server.js"`.

При необходимости настройки из `deploy/railway.toml` можно продублировать в панели Railway (**Settings** → **Deploy** → Start Command: `npm start`).
