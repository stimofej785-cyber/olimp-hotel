# GitHub — простыми словами

## Что уже сделано у вас

Проект **уже загружен** на GitHub:

**https://github.com/stimofej785-cyber/olimp-hotel**

Откройте эту ссылку в браузере — там должен быть весь код сайта.

---

## Что это вообще значит

| Слово | Простыми словами |
|--------|------------------|
| **Git** | Программа, которая сохраняет версии проекта на вашем ПК |
| **GitHub** | Сайт в интернете, куда выкладывают код (как «облако» для программистов) |
| **Репозиторий (repo)** | Одна папка-проект на GitHub, у вас это `olimp-hotel` |
| **Коммит (commit)** | Сохранённый снимок изменений с подписью |
| **Push** | Отправить сохранённые изменения с компьютера на GitHub |

Схема:

```
Ваш компьютер (папка diplom)  --push-->  GitHub (olimp-hotel)  ---->  Railway (сайт в интернете)
```

---

## Если нужно отправить новые изменения

После правок в проекте — **три команды** в PowerShell:

```powershell
cd C:\Users\User\Desktop\diplom
$git = "C:\Program Files\Git\bin\git.exe"

& $git add .
& $git commit -m "Кратко: что изменили"
& $git push
```

Пример: перенесли файлы в `deploy/` — коммит может быть: `"Файлы деплоя в папку deploy"`.

---

## Первый раз (если бы репозитория ещё не было)

### 1. Создать пустое место на GitHub

1. [github.com](https://github.com) → войти в аккаунт  
2. Зелёная кнопка **New** (или **+** → **New repository**)  
3. Имя: `olimp-hotel`  
4. **Не** включать «Add README»  
5. **Create repository**

### 2. Связать папку на ПК с GitHub

Один раз (у вас это уже сделано):

```powershell
cd C:\Users\User\Desktop\diplom
$git = "C:\Program Files\Git\bin\git.exe"

& $git remote add origin https://github.com/ВАШ_ЛОГИН/olimp-hotel.git
& $git push -u origin main
```

При входе GitHub может открыть **браузер** — подтвердите вход.  
Пароль в консоли — это не пароль от сайта, а **токен** (см. ниже), если спросит.

### 3. Токен (если просит пароль и браузер не помог)

1. GitHub → аватар → **Settings**  
2. **Developer settings** → **Personal access tokens** → **Tokens (classic)**  
3. **Generate new token** → галочка **repo** → сгенерировать  
4. Скопировать токен и вставить вместо пароля в PowerShell  

---

## Сейчас у вас: незакоммиченные правки

После переноса файлов в `deploy/` Git видит изменения. Чтобы они попали на GitHub:

```powershell
cd C:\Users\User\Desktop\diplom
$git = "C:\Program Files\Git\bin\git.exe"

& $git add .
& $git status
& $git commit -m "Папка deploy: инструкции и конфиги хостинга"
& $git push
```

Проверка: обновите страницу репозитория на GitHub — должна появиться папка `deploy/`.

---

## Дальше — Railway

Когда код на GitHub актуален → **[RAILWAY.md](./RAILWAY.md)** (тоже упрощённо).

Кратко:

1. [railway.app](https://railway.app) → вход через GitHub  
2. **New Project** → **Deploy from GitHub repo** → выбрать `olimp-hotel`  
3. Добавить переменные (`ADMIN_PASSWORD`, `CORS_ORIGIN` и т.д.)  
4. **Generate Domain** — получить ссылку на живой сайт  

---

## Частые вопросы

**«У меня уже есть push, зачем ещё commit?»**  
Первый push отправил старую версию. Новые правки (папка `deploy/`) нужно снова: add → commit → push.

**«Ошибка: remote origin already exists»**  
Репозиторий уже привязан — команду `remote add` не вводите, только `git push`.

**«node_modules в списке»**  
Не должно быть. Проверьте `.gitignore`. Не коммитьте `node_modules`, `.env`, `Server/olymp.db`.
