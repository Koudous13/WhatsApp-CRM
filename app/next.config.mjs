/** @type {import('next').NextConfig} */
const nextConfig = {
    experimental: {
        serverActions: { bodySizeLimit: '10mb' },
    },
    images: {
        remotePatterns: [
            { hostname: '*.supabase.co' },
        ],
    },
    async headers() {
        return [
            {
                source: '/api/:path*',
                headers: [
                    { key: 'X-Content-Type-Options', value: 'nosniff' },
                    { key: 'X-Frame-Options', value: 'DENY' },
                ],
            },
        ]
    },
}

export default nextConfig
