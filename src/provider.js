const LoadBalancer = require('./utils/loadBalancer');
const config = require('./config');

const loadBalancer = new LoadBalancer(config.rpcUrls);

module.exports = {
    loadBalancer,
};
