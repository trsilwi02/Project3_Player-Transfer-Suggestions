/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  distDir: '.next-build',
  transpilePackages: ['@project3/shared', '@project3/db'],
  serverExternalPackages: ['pg', 'bcryptjs', 'argon2'],
};

export default nextConfig;
