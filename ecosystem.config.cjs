module.exports = {
  apps: [
    {
      name: "olimp-hotel",
      script: "Server/Server.js",
      cwd: __dirname,
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
