import { notFound } from 'next/navigation';

export default async function TransactionPage({ params }: { params: Promise<{ hash: string }> }) {
    // In a real app, this would fetch from the blockchain.
    // Here, we simulate a successful TEE transaction.
    const { hash } = await params;

    if (!hash.startsWith('0x')) {
        notFound();
    }

    return (
        <div className="min-h-screen bg-black text-white p-8 font-mono">
            <div className="max-w-4xl mx-auto border border-zinc-800 rounded-lg overflow-hidden">
                {/* Header */}
                <div className="bg-zinc-900 p-6 border-b border-zinc-800 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                            ✓
                        </div>
                        <h1 className="text-xl font-bold">Transaction Details</h1>
                    </div>
                    <span className="px-3 py-1 bg-emerald-500/10 text-emerald-500 text-sm rounded-full border border-emerald-500/20">
                        Success
                    </span>
                </div>

                {/* Content */}
                <div className="p-6 space-y-6">
                    {/* Transaction Hash */}
                    <div className="space-y-2">
                        <label className="text-zinc-500 text-sm uppercase tracking-wider">Transaction Hash</label>
                        <div className="bg-zinc-950 p-4 rounded border border-zinc-900 break-all text-emerald-400">
                            {hash}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="text-zinc-500 text-sm uppercase tracking-wider">Status</label>
                            <div className="text-white">Confirmed (Simulated)</div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-zinc-500 text-sm uppercase tracking-wider">Block</label>
                            <div className="text-white">Pending (Mempool)</div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-zinc-500 text-sm uppercase tracking-wider">Timestamp</label>
                            <div className="text-white">{new Date().toLocaleString()}</div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-zinc-500 text-sm uppercase tracking-wider">Network</label>
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                                Oasis Sapphire Testnet (Mock)
                            </div>
                        </div>
                    </div>

                    {/* TEE Data */}
                    <div className="mt-8 pt-8 border-t border-zinc-800">
                        <h3 className="text-lg font-bold mb-4">TEE Secure Enclave</h3>
                        <div className="bg-zinc-900/50 rounded-lg p-4 border border-zinc-800 space-y-3">
                            <div className="flex justify-between">
                                <span className="text-zinc-500">Enclave ID</span>
                                <span className="font-mono text-zinc-300">0x7f...3a2b</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-zinc-500">Attestation</span>
                                <span className="text-emerald-500">Verified ✓</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-zinc-500">Gas Used</span>
                                <span className="text-zinc-300">0.000424 ROSE</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="bg-zinc-900/50 p-4 text-center text-zinc-600 text-xs border-t border-zinc-800">
                    This is a simulated transaction view for the Pribado Demo Environment.
                </div>
            </div>
        </div>
    );
}
