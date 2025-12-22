'use client';

import { usePathname } from 'next/navigation';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { NetworkProvider } from '@/contexts/NetworkContext';
import { SubscriptionProvider } from '@/contexts/SubscriptionContext';
import { ToastProvider } from '@/components/Toast';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import NetworkTransition from '@/components/NetworkTransition';
import PaywallModal from '@/components/PaywallModal';

function AuthGuard({ children }: { children: React.ReactNode }) {
    const { isAuthenticated, isLoading } = useAuth();
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        // Redirect to login if not authenticated (except on login page, landing page, and email view)
        // Only redirect if we are DONE loading
        const isPublicRoute = pathname === '/login' || pathname === '/' || pathname.startsWith('/email/');
        if (!isLoading && !isAuthenticated && !isPublicRoute) {
            router.push('/login');
        }
    }, [isAuthenticated, isLoading, pathname, router]);

    // Show loading spinner while AuthContext is restoring session
    // OR if we are about to redirect (not authenticated)
    const isPublicRoute = pathname === '/login' || pathname === '/' || pathname.startsWith('/email/');
    if (isLoading || (!isAuthenticated && !isPublicRoute)) {
        return (
            <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    return <>{children}</>;
}

function LayoutContent({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const { isAuthenticated } = useAuth();
    const isLoginPage = pathname === '/login';
    const isEmailViewPage = pathname.startsWith('/email/');
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [showPaywall, setShowPaywall] = useState(false);

    // Root path: show sidebar when authenticated (dashboard), hide when not (landing)
    // Login page and email view: always no sidebar
    const shouldHideSidebar = isLoginPage || isEmailViewPage || (pathname === '/' && !isAuthenticated);

    if (shouldHideSidebar) {
        return <>{children}</>;
    }

    // Normal pages - with sidebar and header
    return (
        <div className="flex h-screen">
            <Sidebar
                isOpen={sidebarOpen}
                onClose={() => setSidebarOpen(false)}
                onShowPaywall={() => setShowPaywall(true)}
            />
            <div className="flex-1 flex flex-col ml-0 md:ml-64 min-w-0 h-full max-w-full">
                <Header
                    onMenuToggle={() => setSidebarOpen(true)}
                    onShowPaywall={() => setShowPaywall(true)}
                />
                <main className="flex-1 mt-16 overflow-hidden bg-zinc-950 relative h-[calc(100vh-4rem)]">
                    {children}
                </main>
            </div>
            <PaywallModal isOpen={showPaywall} onClose={() => setShowPaywall(false)} />
        </div>
    );
}

export default function AppWrapper({ children }: { children: React.ReactNode }) {
    return (
        <AuthProvider>
            <NetworkProvider>
                <SubscriptionProvider>
                    <ToastProvider>
                        <AuthGuard>
                            <LayoutContent>{children}</LayoutContent>
                        </AuthGuard>
                        {/* Network Transition Overlay */}
                        <NetworkTransition />
                    </ToastProvider>
                </SubscriptionProvider>
            </NetworkProvider>
        </AuthProvider>
    );
}
