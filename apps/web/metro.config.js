const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

// Caminho do projeto (apps/web) e caminho raiz do monorepo
const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// 1. Monitora pastas de todo o monorepo (shared, node_modules raiz, etc.)
config.watchFolders = [monorepoRoot];

// 2. Garante que o Metro resolva dependências em apps/web e na raiz do monorepo
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

module.exports = config;

