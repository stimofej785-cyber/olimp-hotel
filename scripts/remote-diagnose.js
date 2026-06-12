const { Client } = require("ssh2");

const HOST = process.env.SSH_HOST || "139.100.225.87";
const USER = process.env.SSH_USER || "root";
const PASS = process.env.SSH_PASS || "";

const COMMANDS = String(process.env.SSH_CMDS || "")
  .split("|||")
  .map((item) => item.trim())
  .filter(Boolean);

const DEFAULT_CMDS = [
  "hostname; uptime",
  "pm2 status || true",
  "systemctl is-active nginx || true",
  "ufw status verbose || true",
  "fail2ban-client status 2>/dev/null || echo 'no fail2ban'",
  "ss -tlnp | grep -E ':80|:443|:3000' || netstat -tlnp | grep -E ':80|:443|:3000'",
  "curl -sS -o /dev/null -w 'local3000:%{http_code}\\n' http://127.0.0.1:3000/ || true",
  "curl -sS -o /dev/null -w 'local443:%{http_code}\\n' -k https://127.0.0.1/ || true",
  "grep -E '^(NODE_ENV|HOST|PORT|CORS_ORIGIN|ADMIN_|DEMO_)' /var/www/olimp-hotel/.env 2>/dev/null || grep -E '^(NODE_ENV|HOST|PORT|CORS_ORIGIN)' $(find / -maxdepth 4 -name .env -path '*/olimp*' 2>/dev/null | head -1) 2>/dev/null || echo 'env not found'",
  "nginx -t 2>&1",
  "ls -la /etc/nginx/sites-enabled/ 2>/dev/null",
  "tail -n 30 /var/log/nginx/error.log 2>/dev/null || true",
  "pm2 logs olimp --lines 20 --nostream 2>/dev/null || true",
  "journalctl -u nginx --no-pager -n 20 2>/dev/null || true",
  "free -h; df -h /",
];

function run() {
  if (!PASS) {
    console.error("SSH_PASS is required");
    process.exit(1);
  }

  const conn = new Client();
  const cmds = COMMANDS.length ? COMMANDS : DEFAULT_CMDS;
  const script = cmds.join("\necho '---'\n");

  conn
    .on("ready", function () {
      conn.exec(script, function (err, stream) {
        if (err) {
          console.error(err.message);
          conn.end();
          process.exit(1);
        }

        let out = "";
        stream
          .on("close", function (code) {
            process.stdout.write(out);
            conn.end();
            process.exit(code === 0 ? 0 : code || 1);
          })
          .on("data", function (data) {
            out += data.toString();
          });

        stream.stderr.on("data", function (data) {
          out += data.toString();
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
      readyTimeout: 20000,
    });
}

run();
