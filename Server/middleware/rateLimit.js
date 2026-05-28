function createRateLimiter(options) {
  const windowMs = options.windowMs || 15 * 60 * 1000;
  const max = options.max || 20;
  const buckets = new Map();

  return function rateLimitMiddleware(req, res, next) {
    const key = options.keyGenerator ? options.keyGenerator(req) : req.ip || "unknown";
    const now = Date.now();
    let bucket = buckets.get(key);

    if (!bucket || now - bucket.start >= windowMs) {
      bucket = { start: now, count: 0 };
      buckets.set(key, bucket);
    }

    bucket.count += 1;

    if (bucket.count > max) {
      return res.status(429).json({ error: "Слишком много запросов. Попробуйте позже." });
    }

    next();
  };
}

module.exports = { createRateLimiter };
