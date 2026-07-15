import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@pulso/contracts', '@pulso/domain']
};

export default nextConfig;
