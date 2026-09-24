import type { NextConfig } from 'next';
import { SITES } from './config/sites';

// Next ne sert pas index.html pour /Banque/ — rewrites vers public/.../index.html
const INDEX_DIRS = [
  ...Object.values(SITES).map((s) => s.publicPath.replace(/\/$/, '')),
  '/PhieEvreux/app/location',
  '/PhieEvreux/app/log',
  '/PhieEvreux/app/anciennelocation',
];

const nextConfig: NextConfig = {
  trailingSlash: true,
  async rewrites() {
    return INDEX_DIRS.flatMap((dir) => [
      { source: dir, destination: dir + '/index.html' },
      { source: dir + '/', destination: dir + '/index.html' },
    ]);
  },
};

export default nextConfig;
