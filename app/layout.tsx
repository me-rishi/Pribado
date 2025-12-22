import type { Metadata } from 'next'
// import { Red_Hat_Display } from 'next/font/google'
import './globals.css'
import AppWrapper from '@/components/AppWrapper'

// const redHatDisplay = Red_Hat_Display({
//     subsets: ['latin'],
//     weight: ['300', '400', '500', '600', '700', '800', '900'],
//     variable: '--font-red-hat-display',
// })

import {
    //     Dancing_Script,
    //     Great_Vibes,
    //     Allura,
    //     Caveat,
    //     Roboto,
    //     Playfair_Display
} from 'next/font/google'

// const dancingScript = Dancing_Script({ subsets: ['latin'], variable: '--font-dancing' })
// const greatVibes = Great_Vibes({ weight: '400', subsets: ['latin'], variable: '--font-vibes' })
// const allura = Allura({ weight: '400', subsets: ['latin'], variable: '--font-allura' })
// const caveat = Caveat({ subsets: ['latin'], variable: '--font-caveat' })
// const roboto = Roboto({ weight: ['400', '500'], subsets: ['latin'], variable: '--font-roboto' })
// const playfair = Playfair_Display({ subsets: ['latin'], variable: '--font-playfair' })

export const metadata: Metadata = {
    title: 'Pribado Private Suite',
    description: 'Privacy-First Enclave Toolkit',
    icons: {
        icon: '/logo.png',
        apple: '/logo.png',
    },
    viewport: {
        width: 'device-width',
        initialScale: 1,
        maximumScale: 1,
        userScalable: false,
        viewportFit: 'cover',
    },
}

import QueryProvider from '@/components/QueryProvider';

export default function RootLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <html lang="en" className="dark">
            <body className={`bg-zinc-950 text-zinc-50`}>
                <QueryProvider>
                    <AppWrapper>
                        {children}
                    </AppWrapper>
                </QueryProvider>
            </body>
        </html>
    )
}