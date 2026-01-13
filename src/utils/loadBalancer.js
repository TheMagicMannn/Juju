const { ethers } = require("ethers");
const RateLimiter = require("./rateLimiter");

class LoadBalancer {
  constructor(rpcUrls) {
    this.providers = rpcUrls.map(url => new ethers.JsonRpcProvider(url));
    this.currentIndex = 0;
    this.rateLimiter = new RateLimiter(10, 1000); // General rate limit: 10 requests per second
  }

  getNextProvider() {
    const provider = this.providers[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.providers.length;
    return provider;
  }

  async makeRequest(method, params) {
    await this.rateLimiter.acquire();
    let attempts = 0;
    while (attempts < this.providers.length) {
      const provider = this.getNextProvider();
      try {
        const result = await provider.send(method, params);
        return result;
      } catch (error) {
        console.warn(`RPC call failed with provider ${provider.connection.url}: ${error.message}`);
        attempts++;
      }
    }
    throw new Error("All RPC providers failed");
  }
}

module.exports = LoadBalancer;
