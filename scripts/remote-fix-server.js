const { Client } = require("ssh2");

const HOST = process.env.SSH_HOST || "139.100.225.87";
const USER = process.env.SSH_USER || "root";
const PASS = process.env.SSH_PASS || "";

const FIX_SCRIPT = `set -e

APP_DIR=/var/www/olimp-hotel
PM2_NAME=olimp-hotel

echo "==> Backup nginx config"
cp /etc/nginx/sites-available/olimp-hotel /etc/nginx/sites-available/olimp-hotel.bak.$(date +%Y%m%d%H%M%S) || true

echo "==> Write nginx config"
cat > /etc/nginx/sites-available/olimp-hotel <<'NGINX_EOF'
upstream olimp_app {
    server 127.0.0.1:3000;
    keepalive 16;
}

server {
    listen 80;
    listen [::]:80;
    server_name olimp-hotel-sov.ru www.olimp-hotel-sov.ru 139.100.225.87;
    return 301 https://olimp-hotel-sov.ru$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name www.olimp-hotel-sov.ru;

    ssl_certificate /etc/letsencrypt/live/olimp-hotel-sov.ru/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/olimp-hotel-sov.ru/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    return 301 https://olimp-hotel-sov.ru$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name olimp-hotel-sov.ru;

    ssl_certificate /etc/letsencrypt/live/olimp-hotel-sov.ru/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/olimp-hotel-sov.ru/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    client_max_body_size 10m;
    add_header Strict-Transport-Security "max-age=31536000" always;

    location / {
        proxy_pass http://olimp_app;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";
        proxy_connect_timeout 30s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
NGINX_EOF

echo "==> PM2 ecosystem"
cat > $APP_DIR/ecosystem.config.cjs <<'PM2_EOF'
module.exports = {
  apps: [
    {
      name: "olimp-hotel",
      script: "Server/Server.js",
      cwd: "/var/www/olimp-hotel",
      autorestart: true,
      max_restarts: 100,
      min_uptime: "10s",
      max_memory_restart: "250M",
      exp_backoff_restart_delay: 2000,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
PM2_EOF

echo "==> Health check cron"
cat > /etc/cron.d/olimp-hotel-health <<'CRON_EOF'
*/2 * * * * root curl -sf http://127.0.0.1:3000/api/health >/dev/null || /usr/bin/pm2 restart olimp-hotel >/dev/null 2>&1
CRON_EOF
chmod 644 /etc/cron.d/olimp-hotel-health

echo "==> Swap (if missing)"
if ! swapon --show | grep -q swapfile; then
  fallocate -l 1G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=1024
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "==> Ensure .env"
if [ -f $APP_DIR/.env ]; then
  grep -q '^NODE_ENV=' $APP_DIR/.env || echo 'NODE_ENV=production' >> $APP_DIR/.env
  grep -q '^HOST=' $APP_DIR/.env || echo 'HOST=127.0.0.1' >> $APP_DIR/.env
  grep -q '^CORS_ORIGIN=' $APP_DIR/.env || echo 'CORS_ORIGIN=https://olimp-hotel-sov.ru' >> $APP_DIR/.env
fi

echo "==> Restart services"
nginx -t
systemctl reload nginx
cd $APP_DIR
pm2 delete $PM2_NAME >/dev/null 2>&1 || true
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup systemd -u root --hp /root >/tmp/pm2-startup.sh 2>/dev/null || true
if [ -f /tmp/pm2-startup.sh ]; then
  bash /tmp/pm2-startup.sh || true
fi

sleep 2
echo "==> Verify"
curl -sS -o /dev/null -w 'local3000:%{http_code}\\n' http://127.0.0.1:3000/api/health
curl -sS -o /dev/null -w 'local443:%{http_code}\\n' https://olimp-hotel-sov.ru/api/health
pm2 status
echo DONE
`;

function run() {
  if (!PASS) {
    console.error("SSH_PASS is required");
    process.exit(1);
  }

  const conn = new Client();
  conn
    .on("ready", function () {
      conn.exec(FIX_SCRIPT, function (err, stream) {
        if (err) {
          console.error(err.message);
          conn.end();
          process.exit(1);
        }

        stream.on("close", function (code) {
          conn.end();
          process.exit(code === 0 ? 0 : code || 1);
        });

        stream.on("data", function (data) {
          process.stdout.write(data.toString());
        });

        stream.stderr.on("data", function (data) {
          process.stderr.write(data.toString());
        });
      });
    })
    .on("error", function (err) {
      console.error(err.message);
      process.exit(1);
    })
    .connect({
      host: HOST,
      port: 22,
      username: USER,
      password: PASS,
      readyTimeout: 30000,
    });
}

run();
