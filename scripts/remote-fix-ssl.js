const { Client } = require("ssh2");

const HOST = process.env.SSH_HOST || "139.100.225.87";
const USER = process.env.SSH_USER || "root";
const PASS = process.env.SSH_PASS || "";

const FIX_SCRIPT = `set -e

APP_DIR=/var/www/olimp-hotel

echo "==> Fix .env"
cat > $APP_DIR/.env <<'EOF'
NODE_ENV=production
PORT=3000
HOST=127.0.0.1
CORS_ORIGIN=https://olimp-hotel-sov.ru,http://olimp-hotel-sov.ru
ADMIN_EMAIL=admin@olimp.ru
ADMIN_PASSWORD=admin
DEMO_USER_EMAIL=user@olimp.ru
DEMO_USER_PASSWORD=user
PASSWORD_RESET_EXPOSE_LINK=0
DB_PATH=/var/www/olimp-hotel/Server/olymp.db
EOF

echo "==> Reissue SSL with RSA key (better compatibility)"
certbot certonly --nginx \
  --cert-name olimp-hotel-sov.ru \
  --key-type rsa \
  --rsa-key-size 2048 \
  --force-renewal \
  --non-interactive \
  --agree-tos \
  -m admin@olimp.ru \
  -d olimp-hotel-sov.ru \
  -d www.olimp-hotel-sov.ru || true

echo "==> Nginx config: HTTP fallback + compatible TLS (no http2)"
cat > /etc/nginx/sites-available/olimp-hotel <<'NGINX_EOF'
upstream olimp_app {
    server 127.0.0.1:3000;
    keepalive 32;
}

server {
    listen 80;
    listen [::]:80;
    server_name olimp-hotel-sov.ru www.olimp-hotel-sov.ru 139.100.225.87;

    client_max_body_size 10m;

    location / {
        proxy_pass http://olimp_app;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";
        proxy_connect_timeout 30s;
        proxy_send_timeout 120s;
        proxy_read_timeout 120s;
    }
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name www.olimp-hotel-sov.ru;

    ssl_certificate /etc/letsencrypt/live/olimp-hotel-sov.ru/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/olimp-hotel-sov.ru/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;
    ssl_buffer_size 8k;

    return 301 https://olimp-hotel-sov.ru$request_uri;
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name olimp-hotel-sov.ru;

    ssl_certificate /etc/letsencrypt/live/olimp-hotel-sov.ru/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/olimp-hotel-sov.ru/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;
    ssl_buffer_size 8k;

    client_max_body_size 10m;

    location / {
        proxy_pass http://olimp_app;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";
        proxy_connect_timeout 30s;
        proxy_send_timeout 120s;
        proxy_read_timeout 120s;
    }
}
NGINX_EOF

echo "==> Network tuning"
grep -q 'nf_conntrack_max' /etc/sysctl.conf || cat >> /etc/sysctl.conf <<'SYSCTL_EOF'

# olymp-hotel network tuning
net.netfilter.nf_conntrack_max = 65536
net.core.somaxconn = 4096
net.ipv4.tcp_max_syn_backlog = 4096
SYSCTL_EOF
sysctl -p 2>/dev/null || true

echo "==> Restart"
nginx -t
systemctl reload nginx
cd $APP_DIR
pm2 restart olimp-hotel

sleep 2
echo "==> Verify"
curl -sS -o /dev/null -w 'http80:%{http_code} ' http://127.0.0.1/
curl -sS -o /dev/null -w 'https443:%{http_code} ' https://olimp-hotel-sov.ru/
curl -sS -o /dev/null -w 'api:%{http_code}\\n' http://127.0.0.1/api/health
echo | openssl s_client -connect 127.0.0.1:443 -servername olimp-hotel-sov.ru 2>/dev/null | openssl x509 -noout -subject -sigalg 2>/dev/null || true
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
      readyTimeout: 60000,
    });
}

run();
