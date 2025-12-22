/** @type {import('next').NextConfig} */
const nextConfig = {
    // Next.js 16 uses Turbopack by default - add empty config to acknowledge
    turbopack: {},
    serverExternalPackages: ['better-sqlite3'],
    webpack: (config) => {
        config.resolve.alias.canvas = false;
        return config;
    },
    typescript: {
        ignoreBuildErrors: true,
    },
}

module.exports = nextConfig