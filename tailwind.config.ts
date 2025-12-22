import type { Config } from 'tailwindcss'

const config: Config = {
    content: [
        './pages/**/*.{js,ts,jsx,tsx,mdx}',
        './components/**/*.{js,ts,jsx,tsx,mdx}',
        './app/**/*.{js,ts,jsx,tsx,mdx}',
    ],
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
                zinc: {
                    50: '#fafafa',
                    400: '#a1a1aa',
                    800: '#27272a',
                    900: '#18181b',
                    950: '#09090b',
                },
                emerald: {
                    500: '#10b981',
                },
            },
        },
    },
    plugins: [],
}
export default config