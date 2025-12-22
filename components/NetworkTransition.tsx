'use client';

import { useNetwork } from '@/contexts/NetworkContext';

export default function NetworkTransition() {
    const { isTransitioning, targetNetwork } = useNetwork();

    if (!isTransitioning || !targetNetwork) return null;

    const displayName = targetNetwork === 'mainnet' ? 'Mainnet' : 'Testnet';

    return (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-zinc-950/35 backdrop-blur-xl">
            {/* Logo Container */}
            <div className="flex flex-col items-center gap-6">
                {/* Logo with clean 3D flip animation */}
                <div className="relative">
                    {/* Outer glow ring */}
                    <div className="absolute -inset-8 rounded-full bg-gradient-to-r from-blue-500/30 via-emerald-500/30 to-blue-500/30 blur-2xl animate-pulse" />

                    {/* Logo with flip */}
                    <div className="animate-flip-rotate">
                        <img
                            src="/logo.png"
                            alt="Pribado"
                            className="w-16 h-16 md:w-20 md:h-20 object-contain relative z-10"
                        />
                    </div>
                </div>

                {/* Switching text */}
                <div className="text-center">
                    <p className="text-lg md:text-xl font-bold text-zinc-100">
                        Switching to {displayName}
                    </p>
                    <p className="text-sm text-zinc-500 mt-1">
                        Reconnecting to Oasis Sapphire...
                    </p>
                </div>

                {/* Progress bar */}
                <div className="w-48 h-1 bg-zinc-800 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 animate-progress-slide" />
                </div>
            </div>

            {/* CSS for animations */}
            <style jsx global>{`
                @keyframes flip-rotate {
                    0% {
                        transform: perspective(400px) rotateY(0deg) scale(1);
                    }
                    50% {
                        transform: perspective(400px) rotateY(180deg) scale(1.1);
                    }
                    100% {
                        transform: perspective(400px) rotateY(360deg) scale(1);
                    }
                }
                .animate-flip-rotate {
                    animation: flip-rotate 1.5s ease-in-out infinite;
                }
                
                @keyframes progress-slide {
                    0% {
                        width: 0%;
                    }
                    100% {
                        width: 100%;
                    }
                }
                .animate-progress-slide {
                    animation: progress-slide 2.5s ease-out forwards;
                }
            `}</style>
        </div>
    );
}
