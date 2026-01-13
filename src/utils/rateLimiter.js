class RateLimiter {
  constructor(requestsPerInterval, interval) {
    this.requestsPerInterval = requestsPerInterval;
    this.interval = interval;
    this.tokens = requestsPerInterval;
    this.lastRefill = Date.now();
  }

  async acquire() {
    return new Promise(resolve => {
      const tryAcquire = () => {
        this.refill();
        if (this.tokens > 0) {
          this.tokens--;
          resolve();
        } else {
          const waitTime = this.interval - (Date.now() - this.lastRefill);
          setTimeout(() => {
            this.lastRefill = Date.now();
            this.refill();
            this.tokens--;
            resolve();
          }, waitTime);
        }
      };
      tryAcquire();
    });
  }

  refill() {
    const now = Date.now();
    const elapsedTime = now - this.lastRefill;
    if (elapsedTime > this.interval) {
      this.tokens = this.requestsPerInterval;
      this.lastRefill = now;
    }
  }
}

module.exports = RateLimiter;
