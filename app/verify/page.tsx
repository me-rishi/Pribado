'use client';

import { useState } from 'react';
import { ethers } from 'ethers';
import { Search, ShieldCheck, AlertCircle, ArrowRight } from 'lucide-react';

export default function VerifyPage() {
    const [hexInput, setHexInput] = useState('');
    const [decodedData, setDecodedData] = useState<any | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handleDecode = () => {
        setError(null);
        setDecodedData(null);

        if (!hexInput.trim()) {
            return;
        }

        try {
            // Clean input (remove 0x prefix if present, handle potential formatting issues)
            let cleanHex = hexInput.trim();
            if (cleanHex.startsWith('0x')) {
                cleanHex = cleanHex.substring(2);
            }

            // Convert hex to utf8 string
            const utf8String = ethers.toUtf8String('0x' + cleanHex);

            try {
                // Try to parse as JSON
                const json = JSON.parse(utf8String);
                setDecodedData(json);
            } catch {
                // If not JSON, just show the string
                setDecodedData({ rawString: utf8String });
            }
        } catch (err) {
            console.error(err);
            setError('Invalid Hex Data. Please ensure you copied the "Raw Data" field correctly.');
        }
    };

    return (
        <div className="h-full overflow-y-auto overflow-x-hidden p-3 sm:p-4 space-y-6">
            <div className="max-w-4xl mx-auto space-y-6">
                <div>
                    <h1 className="text-3xl font-bold text-zinc-50 mb-2">Transaction Verifier</h1>
                    <p className="text-zinc-400">
                        Decode raw blockchain transaction data to verify document authenticity and signatures.
                    </p>
                </div>

                <div className="grid gap-6">
                    {/* Input Section */}
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                        <label className="block text-sm font-medium text-zinc-400 mb-2">
                            Raw Transaction Hex Data
                        </label>
                        <textarea
                            value={hexInput}
                            onChange={(e) => setHexInput(e.target.value)}
                            placeholder="Paste the 'Raw Data' from the block explorer here (starts with 0x...)"
                            className="w-full h-32 bg-zinc-950 border border-zinc-800 rounded-lg p-4 text-zinc-300 font-mono text-sm focus:outline-none focus:border-emerald-500 transition-colors resize-none mb-4"
                        />
                        <button
                            onClick={handleDecode}
                            disabled={!hexInput.trim()}
                            className="bg-emerald-500 hover:bg-emerald-600 disabled:bg-zinc-800 disabled:text-zinc-500 text-white px-6 py-2 rounded-lg font-medium transition-colors flex items-center gap-2"
                        >
                            <Search className="w-4 h-4" />
                            Decode Data
                        </button>
                    </div>

                    {/* Error Display */}
                    {error && (
                        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-center gap-3 text-red-400">
                            <AlertCircle className="w-5 h-5 flex-shrink-0" />
                            <p>{error}</p>
                        </div>
                    )}

                    {/* Results Display */}
                    {decodedData && (
                        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden animate-fade-in">
                            <div className="bg-zinc-800/50 px-6 py-4 border-b border-zinc-800 flex items-center justify-between">
                                <h2 className="font-semibold text-zinc-50 flex items-center gap-2">
                                    <ShieldCheck className="w-5 h-5 text-emerald-500" />
                                    Decoded Payload
                                </h2>
                                <span className="text-xs font-mono text-zinc-500 bg-zinc-800 px-2 py-1 rounded">UTF-8 JSON</span>
                            </div>

                            <div className="p-6 space-y-6">
                                {/* Public Note Highlight */}
                                {decodedData.note && (
                                    <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-4">
                                        <label className="text-xs font-bold text-emerald-500 mb-1 block uppercase tracking-wider">Public Note</label>
                                        <p className="text-lg text-emerald-100 font-medium">{decodedData.note}</p>
                                    </div>
                                )}

                                {/* Document Info */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {decodedData.id && (
                                        <div>
                                            <label className="text-xs text-zinc-500 block mb-1">Document ID</label>
                                            <p className="font-mono text-[10px] text-zinc-300 bg-zinc-950 px-3 py-2 rounded border border-zinc-800 break-all">
                                                {decodedData.id}
                                            </p>
                                        </div>
                                    )}
                                    {decodedData.ts && (
                                        <div>
                                            <label className="text-xs text-zinc-500 block mb-1">Timestamp</label>
                                            <p className="font-mono text-[10px] text-zinc-300 bg-zinc-950 px-3 py-2 rounded border border-zinc-800">
                                                {new Date(decodedData.ts).toLocaleString()}
                                            </p>
                                        </div>
                                    )}
                                </div>

                                {/* Full JSON Dump */}
                                <div>
                                    <label className="text-xs text-zinc-500 block mb-1">Full JSON Payload</label>
                                    <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4 overflow-x-auto">
                                        <pre className="text-xs text-zinc-400 font-mono">
                                            {JSON.stringify(decodedData, null, 2)}
                                        </pre>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
