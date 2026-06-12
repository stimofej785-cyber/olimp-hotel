# Деплой на Selectel (VPS) с HTTPS

Инструкция для публикации сайта на VPS Selectel с защищённым соединением (SSL/TLS).

## 1. Подготовка сервера

На Ubuntu/Debian:

```bash
sudo apt update
sudo apt install -y git nginx certbot python3-certbot-nginx
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

Убедитесь, что в DNS домена есть **A-запись** на IP вашего VPS Selectel.

## 2. Клонирование и запуск приложения

```bash
cd /var/www
sudo git clone https://github.com/stimofej785-cyber/olimp-hotel.git
cd olimp-hotel
sudo cp deploy/.env.example .env
sudo nano .env
```

В `.env` на сервере:

```env
NODE_ENV=production
PORT=3000
HOST=127.0.0.1
CORS_ORIGIN=https://ваш-домен.ru
ADMIN_EMAIL=admin@olimp.ru
ADMIN_PASSWORD=admin
DEMO_USER_EMAIL=user@olimp.ru
DEMO_USER_PASSWORD=user
PASSWORD_RESET_EXPOSE_LINK=0
DB_PATH=/var/www/olimp-hotel/Server/olymp.db
```

```bash
npm install --production
npm start
```

Проверка: `curl http://127.0.0.1:3000/` должен вернуть HTML.

Для постоянной работы — PM2:

```bash
sudo npm install -g pm2
pm2 start npm --name olimp -- start
pm2 save
pm2 startup
```

## 3. Nginx + SSL (Let's Encrypt)

Скопируйте конфиг и замените домен:

```bash
sudo cp deploy/nginx-olimp.conf /etc/nginx/sites-available/olimp
sudo nano /etc/nginx/sites-available/olimp
```

В файле замените `ваш-домен.ru` на реальный домен.

```bash
sudo ln -sf /etc/nginx/sites-available/olimp /etc/nginx/sites-enabled/olimp
sudo nginx -t
sudo systemctl reload nginx
```

Выпустите бесплатный сертификат:

```bash
sudo certbot --nginx -d ваш-домен.ru -d www.ваш-домен.ru
```

Certbot автоматически:
- установит SSL-сертификат;
- настроит редирект HTTP → HTTPS;
- включит автообновление сертификата.

Проверка продления:

```bash
sudo certbot renew --dry-run
```

## 4. Обновление после изменений на GitHub

```bash
cd /var/www/olimp-hotel
git pull
npm install --production
pm2 restart olimp
```

При смене учётных данных админа/демо-гостя пароли обновятся при перезапуске (`npm start` / `pm2 restart`).

## 5. Вход на сайт

| Роль | Логин | Пароль |
|------|-------|--------|
| Администратор | `admin` | `admin` |
| Демо-гость | `user` | `user` |

Также работают email: `admin@olimp.ru` и `user@olimp.ru`.

Обычные пользователи регистрируются через `register.html` с реальным email, как раньше.

Админка: `https://ваш-домен.ru/admin.html` (после входа с ролью admin).

## 6. Если браузер пишет «Соединение не защищено»

| Причина | Решение |
|---------|---------|
| Открыт `http://` вместо `https://` | Используйте `https://ваш-домен.ru` |
| Сертификат не выпущен | Запустите `certbot --nginx` (шаг 3) |
| DNS ещё не обновился | Подождите 5–60 минут после смены A-записи |
| Nginx не проксирует на Node | Проверьте `sudo nginx -t` и `pm2 status` |

## 7. Альтернатива: SSL в панели Selectel

Если используете балансировщик Selectel с терминацией SSL — настройте сертификат в панели Selectel и проксируйте трафик на VPS:3000. В `.env` укажите `CORS_ORIGIN` с `https://`.
