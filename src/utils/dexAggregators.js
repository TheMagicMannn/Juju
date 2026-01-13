const RateLimiter = require("./rateLimiter");

const dexAggregators = {
  odos: {
    limiter: new RateLimiter(2, 1000), // 2 requests per second
    // other config...
  },
  cowSwap: {
    quoteLimiter: new RateLimiter(10, 1000), // 10 requests per second
    orderLimiter: new RateLimiter(5, 1000), // 5 requests per second
    generalLimiter: new RateLimiter(100, 60000), // 100 requests per minute
    // other config...
  },
  oneInch: {
    limiter: new RateLimiter(60, 60000), // 60 requests per minute
    // other config...
  },
};

module.exports = dexAggregators;
