# Публикация на GitHub (Windows)

Репозиторий уже инициализирован локально. Осталось создать репозиторий на GitHub и отправить код.

## Шаг 1. Создайте репозиторий на GitHub

1. Войдите на [github.com](https://github.com).
2. **+** → **New repository**.
3. Имя, например: `olimp-hotel` или `diplom`.
4. **Public** или **Private** — на ваш выбор.
5. **Не** ставьте галочки «Add README» / «Add .gitignore» (они уже есть в проекте).
6. **Create repository**.

Скопируйте URL репозитория, например:
`https://github.com/ВАШ_ЛОГИН/olimp-hotel.git`

## Шаг 2. Первый коммит (если ещё не сделан)

В PowerShell из папки проекта:

```powershell
cd C:\Users\User\Desktop\diplom
$git = "C:\Program Files\Git\bin\git.exe"

# Один раз укажите имя для коммитов (можно свои данные):
& $git config user.name "Ваше Имя"
& $git config user.email "ваш@email.com"

& $git add .
& $git status
# Не должно быть: node_modules, .env, Server/olymp.db

& $git commit -m "Initial commit: сайт гостиницы Олимп"
& $git branch -M main
```

## Шаг 3. Отправка на GitHub

Подставьте **свой** URL репозитория:

```powershell
& $git remote add origin https://github.com/ВАШ_ЛОГИН/ИМЯ_РЕПО.git
& $git push -u origin main
```

При запросе логина GitHub:
- логин — ваш username;
- пароль — **Personal Access Token** (не пароль от аккаунта).

Токен: GitHub → **Settings** → **Developer settings** → **Personal access tokens** → **Tokens (classic)** → **Generate new token** → права `repo`.

## Шаг 4. Railway

После push откройте **[RAILWAY.md](./RAILWAY.md)**.

## Обновления позже

```powershell
& $git add .
& $git commit -m "Описание изменений"
& $git push
```
