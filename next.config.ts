/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "m.media-amazon.com"
      },
      {
        protocol: "https",
        hostname: "img.omdbapi.com"
      }
    ]
  }
};

export default nextConfig;
