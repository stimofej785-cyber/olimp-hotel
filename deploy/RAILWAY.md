# Railway — простыми словами

Делайте **после того**, как проект на GitHub:  
https://github.com/stimofej785-cyber/olimp-hotel

---

## Что делает Railway

Railway берёт код с GitHub, запускает `npm start` и даёт вам **ссылку в интернете**, например:

`https://olimp-hotel-production-xxxx.up.railway.app`

---

## Шаг 1. Подключить репозиторий

1. Откройте [railway.app](https://railway.app)  
2. **Login** → через **GitHub** (тот же аккаунт, где репозиторий)  
3. **New Project**  
4. **Deploy from GitHub repo**  
5. Выберите **olimp-hotel**  
6. Подождите 2–5 минут — идёт сборка (`npm install`, потом `npm start`)

Если репозитория нет в списке: GitHub → Settings → Applications → разрешить доступ Railway.

---

## Шаг 2. Переменные (обязательно)

В Railway откройте ваш сервис → вкладка **Variables** → **Add Variable**:

| Имя | Что написать |
|-----|----------------|
| `NODE_ENV` | `production` |
| `ADMIN_EMAIL` | ваш email для входа в админку |
| `ADMIN_PASSWORD` | придумайте пароль (запомните!) |
| `PASSWORD_RESET_EXPOSE_LINK` | `0` |

`PORT` **не трогайте** — Railway сам подставит.

---

## Шаг 3. Получить адрес сайта

1. Вкладка **Settings**  
2. Раздел **Networking** → **Generate Domain**  
3. Скопируйте URL (например `https://olimp-hotel-production-xxxx.up.railway.app`)

Добавьте переменную:

| Имя | Значение |
|-----|----------|
| `CORS_ORIGIN` | тот же URL **без** `/` в конце |

Сохраните → **Deployments** → **Redeploy** (перезапуск).

---

## Шаг 4. База не должна пропадать (Volume)

Без этого при каждом перезапуске брони и пользователи могут исчезать.

1. В проекте Railway: **+ New** → **Volume**  
2. Подключить Volume к сервису с сайтом  
3. **Mount path:** `/data`  
4. В Variables добавить: `DB_PATH` = `/data/olymp.db`  
5. **Redeploy**

---

## Шаг 5. Проверка

В браузере откройте:

- `https://ВАШ-ДОМЕН.up.railway.app/api/health` — должно быть `{"ok":true,...}`  
- `https://ВАШ-ДОМЕН.up.railway.app/` — главная страница  
- `https://ВАШ-ДОМЕН.up.railway.app/admin.html` — админка (логин из `ADMIN_EMAIL` / `ADMIN_PASSWORD`)

---

## Если что-то не работает

| Симптом | Что сделать |
|---------|-------------|
| Белая страница / ошибка API | Открывать только ссылку Railway, не файлы с диска |
| Не входит в аккаунт | Проверить `CORS_ORIGIN` = точный URL из Railway |
| Нет админа | Задать `ADMIN_PASSWORD`, Redeploy |
| Данные пропали | Подключить Volume + `DB_PATH` |

---

## Обновление сайта после правок в коде

На компьютере:

```powershell
cd C:\Users\User\Desktop\diplom
$git = "C:\Program Files\Git\bin\git.exe"
& $git add .
& $git commit -m "Описание изменений"
& $git push
```

Railway сам подхватит новый код с GitHub и пересоберёт проект.
