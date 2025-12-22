'use client';

import { useState, useEffect } from 'react';
import {
    ShieldCheck,
    Lock,
    Cpu,
    Zap,
    Activity,
    Server,
    HardDrive,
    Database,
    Key,
    Clock,
    FileText,
    Mail
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { vaultService } from '@/services/vaultService';
import { roflMailService } from '@/services/roflService';

import {
    AreaChart,
    Area,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer
} from 'recharts';


// Helper to extract device info from User-Agent
function getDeviceName(ua: string): string {
    if (!ua) return '-';
    if (ua.includes('curl')) return 'Terminal (Curl)';
    if (ua.includes('Postman')) return 'Postman';
    if (ua.includes('python')) return 'Python Script';

    // Hardware/OS Detection
    if (ua.includes('iPhone')) return 'iPhone';
    if (ua.includes('iPad')) return 'iPad';
    if (ua.includes('Android')) return 'Android';
    if (ua.includes('Macintosh')) return 'Mac';
    if (ua.includes('Windows')) return 'Windows PC';
    if (ua.includes('Linux')) return 'Linux';

    return 'Unknown Device';
}

export default function Dashboard() {

    const { user } = useAuth();
    const [stats, setStats] = useState({
        emailCount: 0,
        storageUsed: 0,
        lastActivity: 'None',
        throughputData: [] as any[],
        // New stats
        secretCount: 0,
        apiUsageCount: 0
    });

    // Audit logs state
    const [auditLogs, setAuditLogs] = useState<any[]>([]);
    const [auditPage, setAuditPage] = useState(0);
    const AUDIT_PAGE_SIZE = 20;

    // 1. Fetch Remote Data (Audit Logs & Server Stats)
    useEffect(() => {
        const loadApiStats = async () => {
            if (!user?.address) return;
            try {
                const enclaveKey = sessionStorage.getItem('pribado_enclave_key');
                const authData = sessionStorage.getItem('pribado_auth');
                const owner = authData ? JSON.parse(authData).address : '';

                // Build headers (optional - API works without them for global stats)
                const headers: Record<string, string> = {};
                if (enclaveKey) headers['x-enclave-key'] = enclaveKey;
                if (owner) headers['x-enclave-owner'] = owner;

                const [statsRes, auditRes] = await Promise.all([
                    fetch('/api/stats', { headers }),
                    fetch('/api/audit', { headers })
                ]);

                let apiUsage = 0;

                if (statsRes.ok) {
                    const s = await statsRes.json();
                    apiUsage = s.apiUsageCount || 0;
                }

                if (auditRes.ok) {
                    const a = await auditRes.json();
                    if (a.logs) setAuditLogs(a.logs);
                }

                setStats(prev => ({
                    ...prev,
                    apiUsageCount: apiUsage,
                }));
            } catch (e) {
                console.error('Failed to load api stats', e);
            }
        };

        loadApiStats();
    }, [user]);

    // 2. Calculate Derived Metrics (Local + Remote)
    useEffect(() => {
        const calculateDashboardMetrics = async () => {
            if (!user?.address) return;

            try {
                // Get local emails
                const storedEmails = JSON.parse(localStorage.getItem('rofl_emails') || '[]');
                const userEmails = storedEmails.filter((e: any) =>
                    e.sender === user.address || e.recipient === user.address
                );

                // Get local secrets
                let vaultSecrets: any[] = [];
                let vaultStorage = 0;
                try {
                    if (vaultService.isInitialized()) {
                        vaultSecrets = await vaultService.getAllSecrets();
                        vaultStorage = vaultService.getStorageUsage();
                    }
                } catch (e) {
                    console.error('Failed to load local vault stats:', e);
                }

                // Storage
                const emailStorage = JSON.stringify(userEmails).length;
                const totalStorageBytes = emailStorage + vaultStorage;
                const storageKB = (totalStorageBytes / 1024).toFixed(2);

                // Last Activity (Merge Emails, Secrets, AND Audit Logs)
                const lastEmailTime = userEmails.length > 0
                    ? Math.max(...userEmails.map((e: any) => e.timestamp))
                    : 0;

                const lastSecretTime = vaultSecrets.length > 0
                    ? Math.max(...vaultSecrets.map((s: any) => s.updatedAt || s.createdAt || 0))
                    : 0;

                const lastAuditTime = auditLogs.length > 0
                    ? Math.max(...auditLogs.map((l: any) => new Date(l.time).getTime()))
                    : 0;

                const lastActivityTime = Math.max(lastEmailTime, lastSecretTime, lastAuditTime);

                let lastActivityStr = 'None';
                if (lastActivityTime > 0) {
                    const d = new Date(lastActivityTime);
                    const now = new Date();
                    const isToday = d.toDateString() === now.toDateString();
                    lastActivityStr = isToday
                        ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        : d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ', ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                }

                // Chart Data (Merge all sources)
                const hours = Array(24).fill(0);
                const today = new Date().toDateString();

                // Process Emails
                userEmails.forEach((item: any) => {
                    const date = new Date(item.timestamp);
                    if (date.toDateString() === today) hours[date.getHours()]++;
                });

                // Process Secrets
                vaultSecrets.forEach((item: any) => {
                    const ts = item.updatedAt || item.createdAt;
                    if (!ts) return;
                    const date = new Date(ts);
                    if (date.toDateString() === today) hours[date.getHours()]++;
                });

                // Process Audit Logs (NEW)
                auditLogs.forEach((log: any) => {
                    if (!log.time) return;
                    const date = new Date(log.time);
                    if (date.toDateString() === today) hours[date.getHours()]++;
                });

                const throughputData = hours.map((count, hour) => ({
                    time: `${hour.toString().padStart(2, '0')}:00`,
                    value: count
                }));

                setStats(prev => ({
                    ...prev,
                    emailCount: userEmails.length,
                    secretCount: vaultSecrets.length,
                    storageUsed: Number(storageKB),
                    lastActivity: lastActivityStr,
                    throughputData
                }));

            } catch (error) {
                console.error('Failed to calculate dashboard metrics:', error);
            }
        };

        calculateDashboardMetrics();
    }, [user, auditLogs]); // Re-run when audit logs arrive

    // Final Metrics Configuration
    const metrics = [
        {
            label: 'Stored Secrets',
            value: stats.secretCount || 0,
            icon: Key,
            color: 'text-purple-400',
            bg: 'bg-purple-500/10',
            border: 'border-purple-500/20'
        },
        {
            label: 'Private API Calls',
            value: stats.apiUsageCount || 0,
            icon: Zap,
            color: 'text-emerald-400',
            bg: 'bg-emerald-500/10',
            border: 'border-emerald-500/20'
        },
        {
            label: 'Private Mails',
            value: stats.emailCount || 0,
            icon: Mail,
            color: 'text-pink-400',
            bg: 'bg-pink-500/10',
            border: 'border-pink-500/20'
        },
        {
            label: 'Encrypted Storage',
            value: `${stats.storageUsed} KB`,
            icon: Database,
            color: 'text-blue-400',
            bg: 'bg-blue-500/10',
            border: 'border-blue-500/20'
        },
        {
            label: 'Last Activity',
            value: stats.lastActivity,
            icon: Clock,
            color: 'text-yellow-400',
            bg: 'bg-yellow-500/10',
            border: 'border-yellow-500/20'
        }
    ];

    const nodeHealthData = [
        { name: 'Gateway', health: 100 },
        { name: 'Enclave', health: 100 },
        { name: 'Storage', health: 100 },
    ];

    return (
        <div className="space-y-3 animate-fade-in h-dvh flex flex-col overflow-hidden p-3 sm:p-4">
            {/* Header */}
            <div className="flex-none">
                <h1 className="text-lg sm:text-xl font-bold text-zinc-50">Pribado Private Suite</h1>
                <p className="text-zinc-400 text-xs">
                    Welcome back, <span className="font-mono text-emerald-400">{user?.shortAddress}</span>
                </p>
            </div>

            {/* Scrollable Content Area */}
            <div className="flex-1 overflow-y-auto space-y-3 sm:space-y-4 scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent w-full max-w-full">

                {/* Metrics Grid - Compact on mobile */}
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-1.5 sm:gap-3 w-full min-w-0">
                    {metrics.map((metric, i) => {
                        const Icon = metric.icon;
                        return (
                            <div
                                key={i}
                                className={`relative group overflow-hidden bg-zinc-900/50 border ${metric.border} rounded-lg sm:rounded-xl p-1.5 sm:p-3 hover:bg-zinc-900 transition-all duration-300 min-w-0`}
                            >
                                {/* Background Icon - Hidden on mobile */}
                                <div className={`hidden sm:block absolute top-0 right-0 p-3 opacity-20 group-hover:opacity-40 transition-opacity`}>
                                    <Icon className={`w-12 h-12 ${metric.color} -mr-2 -mt-2 transform rotate-12`} />
                                </div>

                                {/* Mobile: Horizontal compact layout */}
                                <div className="sm:hidden flex items-center gap-1.5">
                                    <div className={`w-5 h-5 rounded ${metric.bg} flex items-center justify-center flex-shrink-0`}>
                                        <Icon className={`w-2.5 h-2.5 ${metric.color}`} />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-xs font-bold text-zinc-50 truncate">{metric.value}</p>
                                        <p className="text-[7px] font-medium text-zinc-500 uppercase truncate">{metric.label}</p>
                                    </div>
                                </div>

                                {/* Desktop: Vertical layout */}
                                <div className="hidden sm:flex relative z-10 flex-col justify-between h-full">
                                    <div className={`w-8 h-8 rounded-lg ${metric.bg} flex items-center justify-center mb-3`}>
                                        <Icon className={`w-4 h-4 ${metric.color}`} />
                                    </div>
                                    <div>
                                        <p className="text-xl font-bold text-zinc-50 tracking-tight">{metric.value}</p>
                                        <p className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider">{metric.label}</p>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Charts & Status */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 w-full min-w-0">
                    {/* Activity Chart (Takes 2/3) */}
                    <div className="order-1 lg:col-span-2 bg-zinc-900 border border-zinc-800 rounded-lg p-3 min-w-0 overflow-hidden">
                        <div className="flex items-center gap-2 mb-2">
                            <Activity className="w-4 h-4 text-emerald-500" />
                            <h2 className="text-sm font-semibold text-zinc-50">Today's Activity</h2>
                        </div>
                        <div className="h-[140px] w-full">
                            {stats.throughputData.some(d => d.value > 0) ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={stats.throughputData}>
                                        <defs>
                                            <linearGradient id="activityGradient" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.8} />
                                                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                                        <XAxis
                                            dataKey="time"
                                            stroke="#52525b"
                                            fontSize={10}
                                            interval={3}
                                            tickLine={false}
                                            axisLine={false}
                                        />
                                        <YAxis
                                            stroke="#52525b"
                                            fontSize={10}
                                            allowDecimals={false}
                                            tickLine={false}
                                            axisLine={false}
                                        />
                                        <Tooltip
                                            contentStyle={{
                                                backgroundColor: '#18181b',
                                                border: '1px solid #27272a',
                                                borderRadius: '6px',
                                                color: '#fafafa',
                                                fontSize: '12px',
                                                padding: '4px 8px'
                                            }}
                                        />
                                        <Area
                                            type="monotone"
                                            dataKey="value"
                                            stroke="#10b981"
                                            strokeWidth={2}
                                            fillOpacity={1}
                                            fill="url(#activityGradient)"
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center text-zinc-600">
                                    <Activity className="w-8 h-8 mb-2 opacity-20" />
                                    <p className="text-xs">No activity recorded today</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* System Status (Takes 1/3) - Desktop Only */}
                    <div className="hidden lg:flex order-3 lg:order-2 bg-zinc-900 border border-zinc-800 rounded-lg p-3 flex-col justify-center min-w-0">
                        <div className="flex items-center gap-2 mb-3">
                            <Server className="w-4 h-4 text-emerald-500" />
                            <h2 className="text-sm font-semibold text-zinc-50">System Status</h2>
                        </div>
                        <div className="space-y-2">
                            <div className="bg-zinc-800/50 rounded-md p-2 flex items-center justify-between">
                                <span className="text-zinc-400 text-xs">Oasis Sapphire</span>
                                <span className="text-emerald-400 text-[10px] font-mono bg-emerald-500/10 px-1.5 py-0.5 rounded">CONNECTED</span>
                            </div>
                            <div className="bg-zinc-800/50 rounded-md p-2 flex items-center justify-between">
                                <span className="text-zinc-400 text-xs">ROFL Enclave</span>
                                <span className="text-emerald-400 text-[10px] font-mono bg-emerald-500/10 px-1.5 py-0.5 rounded">VERIFIED</span>
                            </div>
                            <div className="bg-zinc-800/50 rounded-md p-2 flex items-center justify-between">
                                <span className="text-zinc-400 text-xs">Storage Enc</span>
                                <span className="text-emerald-400 text-[10px] font-mono bg-emerald-500/10 px-1.5 py-0.5 rounded">ACTIVE</span>
                            </div>
                        </div>
                    </div>
                    {/* Audit History (Dense) */}
                    <div className="order-2 lg:order-3 lg:col-span-3 flex-1 min-h-0 bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden flex flex-col w-full min-w-0">
                        <div className="flex items-center gap-2 p-3 border-b border-zinc-800 bg-zinc-950/30">
                            <FileText className="w-4 h-4 text-zinc-400" />
                            <h2 className="text-sm font-bold text-zinc-50">Audit History</h2>
                        </div>
                        <div className="overflow-auto scrollbar-thin scrollbar-thumb-zinc-800">
                            <table className="w-full text-left text-xs table-fixed min-w-[600px] sm:min-w-0">
                                <thead className="sticky top-0 bg-zinc-950/90 backdrop-blur-sm z-10">
                                    <tr className="border-b border-zinc-800">
                                        <th className="px-4 py-2 font-medium text-zinc-500 w-1/4">Event</th>
                                        <th className="px-4 py-2 font-medium text-zinc-500 w-1/6">User</th>
                                        <th className="px-4 py-2 font-medium text-zinc-500 w-1/6">Source</th>
                                        <th className="px-4 py-2 font-medium text-zinc-500 w-1/6">Device</th>
                                        <th className="px-4 py-2 font-medium text-zinc-500 w-1/12">IP</th>
                                        <th className="px-4 py-2 font-medium text-zinc-500 w-1/6">Time</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-800/50">
                                    {auditLogs.length === 0 ? (
                                        <tr>
                                            <td colSpan={6} className="px-4 py-8 text-center text-zinc-600 italic">
                                                No activity recorded yet.
                                            </td>
                                        </tr>
                                    ) : (
                                        auditLogs.slice(auditPage * AUDIT_PAGE_SIZE, (auditPage + 1) * AUDIT_PAGE_SIZE).map((log, i) => (
                                            <tr key={i} className="hover:bg-zinc-800/30 transition-colors">
                                                <td className="px-4 py-2 text-zinc-300 font-medium truncate">{log.event}</td>
                                                <td className="px-4 py-2 text-zinc-500 truncate" title={log.user}>{log.user}</td>
                                                <td className="px-4 py-2 text-zinc-500 truncate">{log.source}</td>
                                                <td className="px-4 py-2 text-zinc-500 text-[10px] truncate" title={log.details?.userAgent || '-'}>
                                                    {getDeviceName(log.details?.userAgent || '')}
                                                </td>
                                                <td className="px-4 py-2 text-zinc-500 font-mono text-[10px] truncate">{log.ip}</td>
                                                <td className="px-4 py-2 text-zinc-600 truncate">
                                                    {new Date(log.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                            {/* Pagination Controls */}
                            {auditLogs.length > AUDIT_PAGE_SIZE && (
                                <div className="flex items-center justify-between px-4 py-2 border-t border-zinc-800 bg-zinc-950/30">
                                    <span className="text-xs text-zinc-500">
                                        Showing {auditPage * AUDIT_PAGE_SIZE + 1}-{Math.min((auditPage + 1) * AUDIT_PAGE_SIZE, auditLogs.length)} of {auditLogs.length}
                                    </span>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => setAuditPage(p => Math.max(0, p - 1))}
                                            disabled={auditPage === 0}
                                            className="px-3 py-1 text-xs bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed rounded transition-colors"
                                        >
                                            Prev
                                        </button>
                                        <button
                                            onClick={() => setAuditPage(p => Math.min(Math.ceil(auditLogs.length / AUDIT_PAGE_SIZE) - 1, p + 1))}
                                            disabled={(auditPage + 1) * AUDIT_PAGE_SIZE >= auditLogs.length}
                                            className="px-3 py-1 text-xs bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed rounded transition-colors"
                                        >
                                            Next
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* System Status - Mobile Only (Bottom) */}
            <div className="lg:hidden bg-zinc-900 border border-zinc-800 rounded-lg p-3 flex flex-col justify-center min-w-0 mt-3">
                <div className="flex items-center gap-2 mb-3">
                    <Server className="w-4 h-4 text-emerald-500" />
                    <h2 className="text-sm font-semibold text-zinc-50">System Status</h2>
                </div>
                <div className="space-y-2">
                    <div className="bg-zinc-800/50 rounded-md p-2 flex items-center justify-between">
                        <span className="text-zinc-400 text-xs">Oasis Sapphire</span>
                        <span className="text-emerald-400 text-[10px] font-mono bg-emerald-500/10 px-1.5 py-0.5 rounded">CONNECTED</span>
                    </div>
                    <div className="bg-zinc-800/50 rounded-md p-2 flex items-center justify-between">
                        <span className="text-zinc-400 text-xs">ROFL Enclave</span>
                        <span className="text-emerald-400 text-[10px] font-mono bg-emerald-500/10 px-1.5 py-0.5 rounded">VERIFIED</span>
                    </div>
                    <div className="bg-zinc-800/50 rounded-md p-2 flex items-center justify-between">
                        <span className="text-zinc-400 text-xs">Storage Enc</span>
                        <span className="text-emerald-400 text-[10px] font-mono bg-emerald-500/10 px-1.5 py-0.5 rounded">ACTIVE</span>
                    </div>
                </div>
            </div>
        </div>
    );
}