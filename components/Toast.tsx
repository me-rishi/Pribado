'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { CheckCircle, XCircle, Info, AlertTriangle, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface Toast {
    id: string;
    type: ToastType;
    message: string;
    action?: { label: string, onClick: () => void };
}

interface ToastContextType {
    showToast: (message: string, type?: ToastType, action?: { label: string, onClick: () => void }) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const showToast = useCallback((message: string, type: ToastType = 'success', action?: { label: string, onClick: () => void }) => {
        const id = Math.random().toString(36).substring(2, 9);
        setToasts(prev => [...prev, { id, type, message, action }]);

        // Auto-remove after 5 seconds if there's an action, else 3
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, action ? 5000 : 3000);
    }, []);

    const removeToast = (id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    };

    const getIcon = (type: ToastType) => {
        switch (type) {
            case 'success': return <CheckCircle className="w-5 h-5 text-emerald-400" />;
            case 'error': return <XCircle className="w-5 h-5 text-red-400" />;
            case 'warning': return <AlertTriangle className="w-5 h-5 text-amber-400" />;
            default: return <Info className="w-5 h-5 text-blue-400" />;
        }
    };

    const getStyle = (type: ToastType) => {
        switch (type) {
            case 'success': return 'border-emerald-500/30 bg-emerald-500/10';
            case 'error': return 'border-red-500/30 bg-red-500/10';
            case 'warning': return 'border-amber-500/30 bg-amber-500/10';
            default: return 'border-blue-500/30 bg-blue-500/10';
        }
    };

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}

            {/* Toast Container - Centered */}
            <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[200] flex flex-col gap-2 pointer-events-none">
                {toasts.map(toast => (
                    <div
                        key={toast.id}
                        className={`
                            flex items-center gap-3 px-4 py-3 rounded-xl border backdrop-blur-sm
                            shadow-lg animate-slide-up pointer-events-auto
                            ${getStyle(toast.type)}
                        `}
                    >
                        {getIcon(toast.type)}
                        <span className="text-sm font-medium text-zinc-100">{toast.message}</span>
                        {toast.action && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    toast.action?.onClick();
                                    removeToast(toast.id);
                                }}
                                className="ml-2 px-2 py-1 bg-white/10 hover:bg-white/20 text-[10px] font-bold text-white rounded transition-colors whitespace-nowrap"
                            >
                                {toast.action.label}
                            </button>
                        )}
                        <button
                            onClick={() => removeToast(toast.id)}
                            className="ml-2 text-zinc-400 hover:text-zinc-200 transition-colors"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                ))}
            </div>

            <style jsx global>{`
                @keyframes slide-up {
                    from {
                        opacity: 0;
                        transform: translateY(20px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
                .animate-slide-up {
                    animation: slide-up 0.3s ease-out;
                }
            `}</style>
        </ToastContext.Provider>
    );
}

export function useToast() {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within ToastProvider');
    }
    return context;
}
