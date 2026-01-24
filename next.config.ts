const nextConfig = {
  reactCompiler: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'i.pravatar.cc',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com', // Одразу додаємо для Google Auth аватарів
        port: '',
        pathname: '/**',
      },
    ],
  },
};
export default nextConfig;