/** @type {import('next').NextConfig} */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// 获取当前文件的目录路径
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 检测是否存在CNAME文件（表示使用自定义域名）
const hasCNAME = fs.existsSync(path.join(__dirname, 'CNAME'));

// 判断部署环境和获取仓库名称
const isVercel = process.env.VERCEL === '1';
const repositoryName = process.env.REPOSITORY_NAME || 'feedme';
const isGitHubPages = process.env.GITHUB_ACTIONS === 'true' && !isVercel;

// 由于你有自定义域名 (CNAME)，所以不需要 basePath
const basePath = '';
const assetPrefix = '';



const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  output: 'export',
  
  // 设置trailingSlash
  trailingSlash: true,
  
  // 由于使用自定义域名，不需要basePath和assetPrefix
  basePath,
  assetPrefix,
  
  // 解决 fs 和 path 模块的问题
  webpack: (config, { isServer }) => {
    // 为fs和path等Node.js模块提供空模拟
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false, 
        path: false,
      };
    }
    return config;
  },
}

export default nextConfig
