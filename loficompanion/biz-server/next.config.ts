import type { NextConfig } from 'next';

// output: standalone —— Docker 镜像只带 .next/standalone；Vercel 原生识别；
// Cloudflare 走 OpenNext 适配（见 README 部署节）。
const nextConfig: NextConfig = {
  output: 'standalone',
};

export default nextConfig;
