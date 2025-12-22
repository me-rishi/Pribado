'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Lock, KeyRound, Dices, Eye, EyeOff, Copy, Check, RefreshCw, Shield } from 'lucide-react';

export default function LoginPage() {
    const router = useRouter();
    const { login, generateSeedPhrase } = useAuth();

    const [mode, setMode] = useState<'login' | 'signup'>('login');
    const [seedPhrase, setSeedPhrase] = useState('');
    const [generatedSeed, setGeneratedSeed] = useState('');
    const [showSeed, setShowSeed] = useState(false);
    const [copied, setCopied] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [seedConfirmed, setSeedConfirmed] = useState(false);

    const handleGenerateSeed = () => {
        const seed = generateSeedPhrase();
        setGeneratedSeed(seed);
        setSeedConfirmed(false);
        setCopied(false);
    };

    const handleCopy = () => {
        navigator.clipboard.writeText(generatedSeed);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleLogin = async () => {
        if (!seedPhrase.trim()) {
            setError('Please enter your seed phrase');
            return;
        }

        setLoading(true);
        setError('');

        const success = await login(seedPhrase);

        if (success) {
            router.push('/');
        } else {
            setError('Invalid seed phrase. Must be 12 valid words.');
        }

        setLoading(false);
    };

    const handleSignup = async () => {
        if (!generatedSeed) {
            setError('Please generate a seed phrase first');
            return;
        }

        if (!seedConfirmed) {
            setError('Please confirm you have saved your seed phrase');
            return;
        }

        setLoading(true);
        setError('');

        const success = await login(generatedSeed);

        if (success) {
            router.push('/');
        } else {
            setError('Something went wrong. Please try again.');
        }

        setLoading(false);
    };

    // Gradient button classes
    const gradientBtnActive = "bg-gradient-to-r from-blue-500 to-emerald-500 text-white shadow-lg shadow-emerald-500/20";
    const gradientBtnInactive = "bg-zinc-800/50 text-zinc-400 hover:bg-zinc-700/50 border border-zinc-700/50";
    const primaryBtn = "bg-gradient-to-r from-blue-500 to-emerald-500 hover:from-blue-600 hover:to-emerald-600 text-white shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40";

    return (
        <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4 relative overflow-hidden">
            {/* Background Video */}
            <video
                autoPlay
                loop
                muted
                playsInline
                className="absolute inset-0 w-full h-full object-cover opacity-100"
            >
                <source src="/background.webm" type="video/webm" />
            </video>
            {/* Dark overlay for readability */}
            <div className="absolute inset-0 bg-zinc-950/75" />

            <div className="max-w-md w-full relative z-10">
                {/* Logo */}
                <div className="text-center mb-4">
                    <img src="/logo.png" alt="Pribado" className="w-10 sm:w-20 mx-auto drop-shadow-2xl" />
                    <br />
                    <h1 className="text-lg sm:text-3xl font-bold text-zinc-50 -mt-2">
                        Keep it '<span className="bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">Pribado</span>'
                    </h1>
                    <p className="mt-1 text-[10px] sm:text-base font-semibold bg-gradient-to-r from-blue-400/80 to-emerald-400/80 bg-clip-text text-transparent">Zero-Trust Key Manager</p>
                    <p className="mt-0.5 text-xs font-medium bg-gradient-to-b from-white to-zinc-900 bg-clip-text text-transparent">Private by design</p>
                </div>

                {/* Mode Toggle */}
                <div className="flex gap-2 mb-3">
                    <button
                        onClick={() => { setMode('login'); setError(''); }}
                        className={`flex-1 py-2 rounded-lg font-semibold text-xs transition-all duration-300 ${mode === 'login'
                            ? gradientBtnActive
                            : gradientBtnInactive
                            }`}
                    >
                        Login
                    </button>
                    <button
                        onClick={() => { setMode('signup'); setError(''); handleGenerateSeed(); }}
                        className={`flex-1 py-2 rounded-lg font-semibold text-xs transition-all duration-300 ${mode === 'signup'
                            ? gradientBtnActive
                            : gradientBtnInactive
                            }`}
                    >
                        Create Account
                    </button>
                </div>

                {/* Main Card */}
                <div className="bg-zinc-900/50 backdrop-blur-xl border border-zinc-800/50 rounded-xl p-3 sm:p-6 shadow-2xl">
                    {error && (
                        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm flex items-center gap-2">
                            <span className="text-red-500">⚠</span>
                            {error}
                        </div>
                    )}

                    {mode === 'login' ? (
                        /* Login Mode */
                        <div className="space-y-5">
                            <div>
                                <label className="block text-sm font-semibold text-zinc-300 mb-2">
                                    Seed Phrase
                                </label>
                                <div className="relative">
                                    <textarea
                                        value={seedPhrase}
                                        onChange={(e) => setSeedPhrase(e.target.value)}
                                        placeholder="Enter your 12-word seed phrase..."
                                        rows={3}
                                        className="w-full px-4 py-3 bg-zinc-800/50 border border-zinc-700/50 rounded-xl text-zinc-50 placeholder-zinc-500 focus:outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 resize-none font-mono text-sm transition-all"
                                    />
                                </div>
                                <p className="text-xs text-zinc-500 mt-2">
                                    Enter your 12-word recovery phrase separated by spaces
                                </p>
                            </div>

                            <button
                                onClick={handleLogin}
                                disabled={loading}
                                className={`w-full py-3 rounded-lg font-semibold text-sm transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${primaryBtn}`}
                            >
                                {loading ? (
                                    <>
                                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                        Unlocking...
                                    </>
                                ) : (
                                    <>
                                        <KeyRound className="w-5 h-5" />
                                        Unlock Vault
                                    </>
                                )}
                            </button>
                        </div>
                    ) : (
                        /* Signup Mode */
                        <div className="space-y-5">
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="text-sm font-semibold text-zinc-300">
                                        Your Seed Phrase
                                    </label>
                                    <button
                                        onClick={handleGenerateSeed}
                                        className="text-xs text-blue-400 hover:text-emerald-400 flex items-center gap-1 transition-colors"
                                    >
                                        <RefreshCw className="w-3 h-3" />
                                        Regenerate
                                    </button>
                                </div>

                                <div className="relative">
                                    <div className={`p-4 pr-20 bg-zinc-800/50 border border-zinc-700/50 rounded-xl font-mono text-sm leading-relaxed ${showSeed ? 'text-zinc-50' : 'text-zinc-50 blur-sm select-none'
                                        }`}>
                                        {generatedSeed || 'Click "Regenerate" to generate a seed phrase'}
                                    </div>

                                    <div className="absolute right-2 top-2 flex gap-1">
                                        <button
                                            onClick={() => setShowSeed(!showSeed)}
                                            className="p-2 bg-zinc-700/50 hover:bg-zinc-600/50 rounded-lg text-zinc-400 hover:text-zinc-50 transition-all"
                                            title={showSeed ? 'Hide' : 'Show'}
                                        >
                                            {showSeed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                        <button
                                            onClick={handleCopy}
                                            className="p-2 bg-zinc-700/50 hover:bg-zinc-600/50 rounded-lg text-zinc-400 hover:text-zinc-50 transition-all"
                                            title="Copy"
                                        >
                                            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/20 rounded-xl p-4">
                                <p className="text-sm text-amber-400 font-semibold mb-1">⚠️ Important</p>
                                <p className="text-xs text-amber-500/80">
                                    Write down these 12 words and store them safely. This is the ONLY way to recover your account. We cannot recover it for you.
                                </p>
                            </div>

                            <label className="flex items-start gap-3 cursor-pointer group">
                                <input
                                    type="checkbox"
                                    checked={seedConfirmed}
                                    onChange={(e) => setSeedConfirmed(e.target.checked)}
                                    className="mt-1 w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-0"
                                />
                                <span className="text-sm text-zinc-400 group-hover:text-zinc-300 transition-colors">
                                    I have securely saved my seed phrase and understand I cannot recover my account without it.
                                </span>
                            </label>

                            <button
                                onClick={handleSignup}
                                disabled={loading || !seedConfirmed}
                                className={`w-full py-3 rounded-lg font-semibold text-sm transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${primaryBtn}`}
                            >
                                {loading ? (
                                    <>
                                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                        Creating...
                                    </>
                                ) : (
                                    <>
                                        <Dices className="w-5 h-5" />
                                        Create Vault
                                    </>
                                )}
                            </button>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="text-center mt-6">
                    <p className="text-xs text-zinc-600 flex items-center justify-center gap-2">
                        <Shield className="w-3 h-3 text-emerald-500/50" />
                        Secured by TEE • Oasis Sapphire
                    </p>
                </div>
            </div>
        </div>
    );
}
