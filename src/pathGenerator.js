const fs = require('fs/promises');
const path = require('path');
const { log, withErrorHandling } = require('./utils');

class PathGenerator {
    constructor(tokenDatabase, flashLoanAssets) {
        this.tokenDatabase = tokenDatabase;
        this.flashLoanAssets = flashLoanAssets;
        this.graph = this.buildGraph();
    }

    /**
     * Builds a graph representation from the token database.
     */
    buildGraph() {
        const graph = new Map();
        for (const [tokenAddress, tokenData] of Object.entries(this.tokenDatabase)) {
            const neighbors = new Map();
            for (const [pairAddress, pairData] of Object.entries(tokenData.pairs)) {
                if (this.tokenDatabase[pairAddress]) {
                    neighbors.set(pairAddress, pairData.dex);
                }
            }
            graph.set(tokenAddress, neighbors);
        }
        log(`Built trading graph with ${graph.size} nodes.`);
        return graph;
    }

    /**
     * Finds all circular paths from 2 to 6 hops.
     */
    generatePaths() {
        const allPaths = [];
        log('Starting path generation...');

        for (const startNode of this.flashLoanAssets) {
            if (!this.graph.has(startNode)) continue;
            this.findCircularPaths(startNode, [startNode], new Set([startNode]), allPaths);
        }

        log(`Generated a total of ${allPaths.length} potential arbitrage paths.`);
        return this.sortPathsByLiquidity(allPaths);
    }

    /**
     * Recursive DFS to find circular paths.
     */
    findCircularPaths(startNode, currentPath, visited, allPaths) {
        const minHops = 2;
        const maxHops = 6;

        if (currentPath.length > maxHops) return;

        const lastNode = currentPath[currentPath.length - 1];
        const neighbors = this.graph.get(lastNode);

        if (!neighbors) return;

        for (const [neighbor, dex] of neighbors.entries()) {
            if (neighbor === startNode && currentPath.length >= minHops) {
                const finalPath = [...currentPath, neighbor];
                allPaths.push(this.formatPath(finalPath));
            } else if (!visited.has(neighbor) && currentPath.length < maxHops) {
                visited.add(neighbor);
                this.findCircularPaths(startNode, [...currentPath, neighbor], visited, allPaths);
                visited.delete(neighbor); // Backtrack
            }
        }
    }

    /**
     * Formats a path to include the DEX for each hop.
     */
    formatPath(path) {
        const formattedPath = [];
        for (let i = 0; i < path.length - 1; i++) {
            const fromToken = path[i];
            const toToken = path[i + 1];
            const dex = this.graph.get(fromToken).get(toToken);
            formattedPath.push({ from: fromToken, to: toToken, dex });
        }
        return formattedPath;
    }

    /**
     * Sorts paths based on the minimum liquidity of any token in the path.
     */
    sortPathsByLiquidity(paths) {
        const getPathLiquidity = (path) => {
            let minLiquidity = Infinity;
            const uniqueTokens = new Set(path.flatMap(hop => [hop.from, hop.to]));
            for (const tokenAddress of uniqueTokens) {
                const tokenData = this.tokenDatabase[tokenAddress];
                if (tokenData && tokenData.liquidity < minLiquidity) {
                    minLiquidity = tokenData.liquidity;
                }
            }
            return minLiquidity;
        };
        return paths.sort((a, b) => getPathLiquidity(b) - getPathLiquidity(a));
    }
}

async function generateAndCachePaths(config, tokenDatabase) {
    const pathsPath = path.join(__dirname, '../config/paths.json');

    try {
        const pathGenerator = new PathGenerator(tokenDatabase, config.hubAssets);
        const paths = pathGenerator.generatePaths();

        await fs.writeFile(pathsPath, JSON.stringify(paths, null, 2));
        log(`Saved ${paths.length} paths to ${pathsPath}`);
        return paths;

    } catch (error) {
        log(`Error generating paths: ${error.message}`);
        return [];
    }
}

module.exports = {
    generateAndCachePaths: withErrorHandling(generateAndCachePaths),
};
