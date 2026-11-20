/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@project3/shared', '@project3/db'],
  experimental: {
    serverComponentsExternalPackages: ['pg', 'bcryptjs'],
  },
};

export default nextConfig;
