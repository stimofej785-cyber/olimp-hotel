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
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup systemd -u root --hp /root
# выполните команду, которую выведет pm2 startup
systemctl enable pm2-root
systemctl start pm2-root
```

Автопроверка (если Node упал, перезапуск каждые 2 минуты):
```bash
echo '*/2 * * * * root curl -sf http://127.0.0.1:3000/api/health >/dev/null || /usr/bin/pm2 restart olimp-hotel' | sudo tee /etc/cron.d/olimp-hotel-health
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

### Важно: если HTTPS не открывается без VPN (а HTTP работает)

На части российских сетей TLS на 443 обрывается из‑за MTU (пакеты SSL слишком большие). VPN это маскирует. На сервере нужно:

```bash
sudo iptables -t mangle -A POSTROUTING -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --set-mss 1360
```

И в `/etc/ufw/before.rules` перед `# End required lines` добавить:

```
# olimp-mtu-fix
-A tcp -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --set-mss 1360
```

```bash
sudo ufw reload
```

### Критично: UFW не должен блокировать Node.js на localhost

Если сайт «умирает» через 10–15 минут, а в `/var/log/nginx/error.log` есть `upstream timed out` — UFW блокирует nginx → Node на порту 3000:

```bash
sudo ufw allow in on lo
sudo ufw allow from 127.0.0.1
sudo ufw reload
```

Проверка: `curl http://127.0.0.1:3000/api/health` должен сразу вернуть `{"ok":true,...}`.

Сайт также доступен по **http://ваш-домен.ru** — если HTTPS не открывается у вашего провайдера без VPN.

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
