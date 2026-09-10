import type { NextConfig } from 'next';

// output: standalone —— Docker 镜像只带 .next/standalone；Vercel 原生识别；
// Cloudflare 走 OpenNext 适配（见 README 部署节）。
const nextConfig: NextConfig = {
  output: 'standalone',
  // sharp 带平台原生二进制：保持 external 由 node_modules 运行时解析，
  // 不进打包产物（缩略图管线 data/thumbs.ts 依赖）。
  serverExternalPackages: ['sharp'],
};

export default nextConfig;
