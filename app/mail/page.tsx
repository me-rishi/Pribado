'use client';

import { useState, useMemo, useEffect } from 'react';
import { roflMailService } from '@/services/roflService';
import { mockAIResponses } from '@/mock/ai-responses';
import { Email } from '@/types';
import {
    Mail,
    Inbox,
    Send,
    FileText,
    Trash2,
    Star,
    Reply,
    ReplyAll,
    Forward,
    Paperclip,
    Search,
    Edit3,
    X,
    ChevronLeft,
    MoreVertical,
    AlertCircle,
    Lock,
    Unlock,
    ExternalLink,
    Dices,
    KeyRound,
    Cloud,
    Upload,
    Download,
    RefreshCw,
    VenetianMask,
    Plus,
    Copy,
    Play
} from 'lucide-react';
import { vaultService } from '@/services/vaultService';

type MailFolder = 'inbox' | 'sent';
type MailView = 'list' | 'compose' | 'read';

import { useAuth } from '@/contexts/AuthContext';
import { useNetwork } from '@/contexts/NetworkContext';

export default function PrivateMail() {
    const { user } = useAuth();
    const { network } = useNetwork();
    const [selectedFolder, setSelectedFolder] = useState<MailFolder>('inbox');
    const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
    const [view, setView] = useState<MailView>('list');
    const [searchQuery, setSearchQuery] = useState('');
    const [composeData, setComposeData] = useState({
        to: '',
        subject: '',
        body: '',
        isEncrypted: true,
        accessType: 'key' as 'email' | 'key',
        secretKey: '',
        hint: ''
    });
    const [emails, setEmails] = useState<Email[]>([]);
    const [aliases, setAliases] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);

    // Sending animation states
    const [isSending, setIsSending] = useState(false);
    const [sendingStatus, setSendingStatus] = useState('');
    const [displayBody, setDisplayBody] = useState('');

    // Cloud Sync States
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncStatus, setSyncStatus] = useState<'idle' | 'uploading' | 'downloading'>('idle');

    // Toast notification state
    const [toast, setToast] = useState<{
        show: boolean;
        type: 'success' | 'warning' | 'error';
        title: string;
        message: string;
        txHash?: string | null;
        explorerUrl?: string | null;
    }>({ show: false, type: 'success', title: '', message: '' });

    useEffect(() => {
        loadEmails();
        loadAliases();
    }, [selectedFolder, user]);

    const loadAliases = async () => {
        if (user?.address) {
            const list = await roflMailService.getDisposableAliases(user.address);
            setAliases(list);
        }
    };

    const handleCreateAlias = async () => {
        if (!user?.address) return;
        const newAlias = await roflMailService.createDisposableAlias(user.address);
        setAliases(prev => [...prev, newAlias]);
        setToast({ show: true, type: 'success', title: 'Identity Created', message: 'New burner alias ready.' });
    };

    const handleDeleteAlias = async (alias: string) => {
        await roflMailService.deleteDisposableAlias(alias);
        setAliases(prev => prev.filter(a => a !== alias));
        setToast({ show: true, type: 'success', title: 'Identity Burned', message: 'Alias deleted forever.' });
    };

    const handleSimulateIncoming = async (alias: string) => {
        const confirm = window.confirm('Simulate an incoming email from Google to this alias?');
        if (!confirm) return;

        const success = await roflMailService.simulateIncomingSMTP(
            alias,
            'friend@gmail.com',
            'Hello from the Outside World!',
            'This is a real email sent from Gmail, passing through the SMTP Gateway, encrypted, and delivered to your chain wallet.\n\nReply logic would work via the Gateway too.'
        );

        if (success) {
            setToast({ show: true, type: 'success', title: 'Email Received', message: 'Check your Inbox!' });
            loadEmails(); // Refresh inbox
        } else {
            setToast({ show: true, type: 'error', title: 'Simulation Failed', message: 'Could not deliver email.' });
        }
    };

    const loadEmails = async () => {
        setLoading(true);
        try {
            const userAddress = user?.address;
            if (!userAddress) {
                setLoading(false);
                return;
            }

            if (selectedFolder === 'sent') {
                // For sent folder, get emails sent by the user
                const allStored = JSON.parse(localStorage.getItem('rofl_emails') || '[]');
                console.log('All stored emails:', allStored); // Debug log
                const sentEmails = allStored.filter((email: any) => email.sender === userAddress);
                console.log('Sent emails found:', sentEmails); // Debug log

                const transformedEmails: Email[] = sentEmails.map((email: any) => ({
                    id: email.id,
                    subject: email.metadata?.subject || 'No Subject',
                    sender: 'Me',
                    senderEmail: email.sender,
                    recipient: email.recipient.split('@')[0] || email.recipient,
                    recipientEmail: email.recipient,
                    date: new Date(email.timestamp).toLocaleString(),
                    body: email.encryptedBody,
                    encrypted: email.metadata?.isEncrypted || false,
                    folder: 'sent',
                    read: true,
                    starred: false,
                    attachments: [],
                    txHash: email.txHash || null,
                    explorerUrl: email.explorerUrl || null,
                }));

                console.log('Transformed sent emails:', transformedEmails); // Debug log
                setEmails(transformedEmails);
            } else {
                // For inbox, get emails received by the user
                const userEmails = await roflMailService.getUserEmails(userAddress);

                // Filter out emails sent by me (should only be in Sent folder)
                const receivedEmails = userEmails.filter((email: any) => email.sender !== userAddress);

                const transformedEmails: Email[] = receivedEmails.map((email: any) => ({
                    id: email.id,
                    subject: email.metadata?.subject || 'No Subject',
                    sender: email.metadata?.originalSender || email.sender.split('@')[0] || email.sender,
                    senderEmail: email.metadata?.isExternal ? 'via SMTP Bridge' : (email.sender.split('@')[0] || email.sender),
                    senderEmailFull: email.metadata?.originalSender || email.sender,
                    recipient: email.recipient.split('@')[0] || email.recipient,
                    recipientEmail: email.recipient,
                    date: new Date(email.timestamp).toLocaleString(),
                    body: email.encryptedBody, // Will be decrypted when opened
                    encrypted: email.metadata?.isEncrypted || false,
                    folder: 'inbox',
                    read: false,
                    starred: false,
                    attachments: [],
                    txHash: email.txHash || null,
                    explorerUrl: email.explorerUrl || null,
                    isExternal: email.metadata?.isExternal || false
                }));

                setEmails(transformedEmails);
            }
        } catch (error) {
            console.error('Failed to load emails:', error);
            setEmails([]);
        } finally {
            setLoading(false);
        }
    };

    const filteredEmails = useMemo(() => {
        return emails
            .filter(email =>
                email.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
                email.sender.toLowerCase().includes(searchQuery.toLowerCase()) ||
                email.body.toLowerCase().includes(searchQuery.toLowerCase())
            )
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [emails, searchQuery]);

    const stats = {
        inbox: emails.filter(e => e.folder === 'inbox').length,
        sent: emails.filter(e => e.folder === 'sent').length,
        unread: emails.filter(e => e.folder === 'inbox' && !e.read).length,
        starred: emails.filter(e => e.starred).length
    };

    const handleCompose = () => {
        setView('compose');
        setSelectedEmail(null);
        setComposeData({ to: '', subject: '', body: '', isEncrypted: true, accessType: 'key', secretKey: '', hint: '' });
    };

    const handleSend = async () => {
        if (isSending) return;

        setIsSending(true);
        setDisplayBody(composeData.body);

        const matrixChars = '01アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン';
        const originalBody = composeData.body;

        // Helper to wait
        const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

        // Matrix scramble effect
        const scrambleText = async () => {
            const chars = originalBody.split('');
            for (let round = 0; round < 8; round++) {
                const scrambled = chars.map((char, i) => {
                    if (char === ' ' || char === '\n') return char;
                    const scrambleChance = (round + 1) * 0.12;
                    if (Math.random() < scrambleChance) {
                        return matrixChars[Math.floor(Math.random() * matrixChars.length)];
                    }
                    return char;
                }).join('');
                setDisplayBody(scrambled);
                await delay(150);
            }
        };

        // Delete characters one by one
        const deleteText = async () => {
            let currentText = displayBody || originalBody;
            while (currentText.length > 0) {
                const charsToDelete = Math.min(Math.ceil(currentText.length * 0.1) + 1, currentText.length);
                currentText = currentText.slice(0, -charsToDelete);
                setDisplayBody(currentText + '▌');
                await delay(30);
            }
            setDisplayBody('');
        };

        try {
            const sender = user?.address;
            if (!sender) {
                setToast({
                    show: true,
                    type: 'error',
                    title: 'Authentication Error',
                    message: 'You must be logged in to send emails.'
                });
                setIsSending(false);
                return;
            }
            const isExternalEmail = !composeData.to.endsWith('@pribado.dev');

            // Phase 1: Initializing
            setSendingStatus('🔐 Initializing TEE enclave...');
            await delay(1000);

            // Phase 2: Connecting
            setSendingStatus('🌐 Connecting to Sapphire network...');
            await delay(1000);

            // Phase 3: Generating keys
            setSendingStatus('🔑 Generating ephemeral keys...');
            await delay(1000);

            // Phase 4: Scramble effect
            setSendingStatus('🔒 Encrypting your message...');
            await scrambleText();

            // Phase 5: Hashing
            setSendingStatus('🧬 Computing cryptographic hash...');
            await delay(1000);

            // Phase 6: Delete animation
            setSendingStatus('💨 Shredding plaintext...');
            await deleteText();

            // Phase 7: Sealing
            setSendingStatus('🛡️ Sealing in TEE enclave...');
            await delay(1000);

            // Phase 8: Preparing transaction
            setSendingStatus('📦 Preparing blockchain transaction...');
            await delay(1000);

            // Phase 9: Signing
            setSendingStatus('✍️ Signing with private key...');
            await delay(1000);

            // Phase 10: Storing on blockchain
            setSendingStatus('⛓️ Broadcasting to Sapphire...');

            const result = await roflMailService.sendEncryptedEmail(
                sender,
                composeData.to,
                composeData.subject,
                composeData.body,
                composeData.isEncrypted,
                composeData.accessType,
                composeData.secretKey,
                composeData.hint
            );

            console.log('Email stored on Sapphire via ROFL:', result);

            const txInfo = result.txHash
                ? `\nTransaction: ${result.txHash}\nExplorer: ${result.explorerUrl}`
                : '\n(Stored locally - configure SAPPHIRE_PRIVATE_KEY for on-chain storage)';

            if (isExternalEmail) {
                setSendingStatus('📧 Sending notification email...');

                const secureLink = `https://pribado.dev/email/${result.emailId}#key=${result.accessKey}`;

                const response = await fetch('/api/send-notification', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        recipientEmail: composeData.to,
                        senderEmail: sender,
                        subject: composeData.subject,
                        secureLink: secureLink,
                        emailId: result.emailId
                    }),
                });

                const notifyResult = await response.json();

                setSendingStatus('✅ Complete!');
                await delay(500);

                if (notifyResult.success) {
                    setToast({
                        show: true,
                        type: 'success',
                        title: '✅ TEE-Secured Email Sent!',
                        message: `Email sent to ${composeData.to}. A notification has been sent with instructions to access the encrypted message.`,
                        txHash: result.txHash,
                        explorerUrl: result.explorerUrl,
                    });
                } else {
                    setToast({
                        show: true,
                        type: 'warning',
                        title: '⚠️ Email Stored, Notification Failed',
                        message: `Your encrypted email was stored on-chain, but the recipient notification failed. They may not receive the access link.`,
                        txHash: result.txHash,
                        explorerUrl: result.explorerUrl,
                    });
                }
            } else {
                setSendingStatus('✅ Complete!');
                await delay(500);

                setToast({
                    show: true,
                    type: 'success',
                    title: '✅ Encrypted Email Sent!',
                    message: `Your message to ${composeData.to} has been encrypted and stored on Sapphire blockchain. Only the recipient can decrypt it.`,
                    txHash: result.txHash,
                    explorerUrl: result.explorerUrl,
                });
            }

            setView('list');
            setComposeData({ to: '', subject: '', body: '', isEncrypted: true, accessType: 'key', secretKey: '', hint: '' });
            loadEmails();
        } catch (error) {
            console.error('Failed to send email:', error);
            setSendingStatus('❌ Failed!');
            await delay(1000);
            setToast({
                show: true,
                type: 'error',
                title: '❌ Failed to Send',
                message: 'Something went wrong while sending your encrypted email. Please try again.',
                txHash: null,
                explorerUrl: null,
            });
        } finally {
            setIsSending(false);
            setSendingStatus('');
            setDisplayBody('');
        }
    };

    // ==========================================
    // CLOUD SYNC HANDLERS
    // ==========================================

    const handleSyncHistory = async () => {
        if (!user?.address || isSyncing) return;
        setIsSyncing(true);
        setSyncStatus('uploading');

        try {
            // 1. Get all local emails
            const storedEmails = localStorage.getItem('rofl_emails') || '[]';

            // 2. Encrypt the entire blob with Vault Key (Argon2id)
            // This ensures only the user can read their history, even if chain data is public
            const encryptedBlob = await vaultService.encryptData(storedEmails);

            // 3. Upload to Sapphire (Serialize EncryptedBlob to string)
            const result = await roflMailService.storeCloudBackup(JSON.stringify(encryptedBlob), user.address);

            setToast({
                show: true,
                type: 'success',
                title: '☁️ Sync Complete',
                message: 'Your email history is encrypted and safely backed up to the Sapphire blockchain.',
                txHash: result.txHash,
                explorerUrl: `https://explorer.oasis.io/${network === 'mainnet' ? 'mainnet' : 'testnet'}/sapphire/tx/${result.txHash}`
            });
        } catch (error) {
            console.error('Sync failed:', error);
            setToast({
                show: true,
                type: 'error',
                title: 'Sync Failed',
                message: 'Could not backup email history. Please try again.'
            });
        } finally {
            setIsSyncing(false);
            setSyncStatus('idle');
        }
    };

    const handleRetrieveHistory = async () => {
        if (!user?.address || isSyncing) return;
        setIsSyncing(true);
        setSyncStatus('downloading');

        try {
            // 1. Fetch from Sapphire
            const result = await roflMailService.restoreCloudBackup(user.address);

            if (!result) {
                setToast({
                    show: true,
                    type: 'warning',
                    title: 'No Backup Found',
                    message: 'We could not find any email history for this account on the network.'
                });
                return;
            }

            // 2. Decrypt with Vault Key
            const encryptedBlob = JSON.parse(result.encryptedMail);
            const decryptedString = await vaultService.decryptData(encryptedBlob);
            if (!decryptedString) {
                throw new Error('Decryption failed');
            }

            const remoteEmails = JSON.parse(decryptedString);
            const localEmails = JSON.parse(localStorage.getItem('rofl_emails') || '[]');

            // 3. Merge Strategies (Union by ID)
            const emailMap = new Map();
            localEmails.forEach((e: any) => emailMap.set(e.id, e));
            remoteEmails.forEach((e: any) => emailMap.set(e.id, e)); // Remote overwrites local duplicates? Or keep local?
            // Actually, safest is to trust the one with more data, but usually they are identical.
            // Let's assume union is fine.

            const mergedEmails = Array.from(emailMap.values());

            // 4. Save and Reload
            localStorage.setItem('rofl_emails', JSON.stringify(mergedEmails));
            loadEmails();

            setToast({
                show: true,
                type: 'success',
                title: '☁️ History Restored',
                message: `Successfully retrieved ${remoteEmails.length} emails from the blockchain. Merged with local copy.`
            });

        } catch (error) {
            console.error('Retrieve failed:', error);
            setToast({
                show: true,
                type: 'error',
                title: 'Retrieve Failed',
                message: 'Failed to access or decrypt history. Are you logged in with the correct seed phrase?'
            });
        } finally {
            setIsSyncing(false);
            setSyncStatus('idle');
        }
    };

    const handleEmailClick = async (email: Email) => {
        try {
            // Decrypt email body if encrypted
            if (email.encrypted) {
                const decryptedEmail = await roflMailService.receiveEncryptedEmail(email.id);
                setSelectedEmail({
                    ...email,
                    body: decryptedEmail.body
                });
            } else {
                setSelectedEmail(email);
            }
            setView('read');
        } catch (error) {
            console.error('Failed to open email:', error);
            alert('Failed to decrypt email. Check console for details.');
        }
    };

    const handleBack = () => {
        setView('list');
        setSelectedEmail(null);
    };

    const folders = [
        { id: 'inbox' as MailFolder, name: 'Inbox', icon: Inbox, count: stats.unread },
        { id: 'sent' as MailFolder, name: 'Sent', icon: Send, count: stats.sent },
    ];

    if (view === 'compose') {
        return (
            <div className="space-y-3 animate-fade-in h-[calc(100vh-2rem)] flex flex-col overflow-hidden">
                <div className="flex-1 flex flex-col bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden relative">
                    {/* Sending Overlay */}
                    {isSending && (
                        <div className="absolute inset-0 bg-zinc-950/90 backdrop-blur-sm z-50 flex flex-col items-center justify-center">
                            <div className="relative">
                                {/* Spinning ring */}
                                <div className="w-16 h-16 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin"></div>
                                {/* Inner pulse */}
                                <div className="absolute inset-2 bg-emerald-500/20 rounded-full animate-pulse"></div>
                                {/* Center icon */}
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <Lock className="w-5 h-5 text-emerald-500" />
                                </div>
                            </div>
                            <p className="mt-4 text-sm font-medium text-emerald-400 animate-pulse">
                                {sendingStatus}
                            </p>
                            {displayBody && (
                                <div className="mt-4 max-w-lg mx-auto px-6">
                                    <div className="bg-zinc-900/80 border border-emerald-500/30 rounded-lg p-3 font-mono text-xs text-emerald-400/80 max-h-32 overflow-hidden">
                                        {displayBody}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Compose Header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-950/30">
                        <div className="flex items-center gap-3">
                            <button
                                onClick={handleBack}
                                disabled={isSending}
                                className="p-1.5 text-zinc-400 hover:text-zinc-50 hover:bg-zinc-800 rounded-md transition-colors disabled:opacity-50"
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                            <h1 className="text-sm font-bold text-zinc-200">New Message</h1>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="text-[10px] text-zinc-500 mr-2 flex items-center gap-1.5">
                                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
                                SECURE CHANNEL
                            </div>
                            <button
                                onClick={handleSend}
                                disabled={isSending}
                                className="px-4 py-1.5 bg-emerald-500 text-white rounded-md hover:bg-emerald-600 transition-colors text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg shadow-emerald-500/10"
                            >
                                {isSending ? (
                                    <>
                                        <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                        Sending...
                                    </>
                                ) : (
                                    <>
                                        <Send className="w-3 h-3" />
                                        Send Encrypted
                                    </>
                                )}
                            </button>
                        </div>
                    </div>

                    {/* Compose Form */}
                    <div className="flex-1 p-0 overflow-y-auto">
                        <div className="max-w-4xl mx-auto">
                            <div className="flex items-center px-4 py-2 border-b border-zinc-800/50">
                                <label className="text-xs font-medium text-zinc-500 w-16">To</label>
                                <input
                                    type="email"
                                    value={composeData.to}
                                    onChange={(e) => setComposeData({ ...composeData, to: e.target.value })}
                                    placeholder="recipient@example.com"
                                    disabled={isSending}
                                    className="flex-1 bg-transparent text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none disabled:opacity-50"
                                />
                            </div>

                            <div className="flex items-center px-4 py-2 border-b border-zinc-800/50">
                                <label className="text-xs font-medium text-zinc-500 w-16">Subject</label>
                                <input
                                    type="text"
                                    value={composeData.subject}
                                    onChange={(e) => setComposeData({ ...composeData, subject: e.target.value })}
                                    placeholder="Subject"
                                    disabled={isSending}
                                    className="flex-1 bg-transparent text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none disabled:opacity-50 font-medium"
                                />
                            </div>

                            {/* Access Options */}
                            <div className="px-4 py-3 bg-zinc-900/50 border-b border-zinc-800/50">
                                <div className="flex gap-4">
                                    <div className="flex-1 space-y-2">
                                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
                                            <KeyRound className="w-3 h-3 text-emerald-500" />
                                            Decryption Key
                                        </label>
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                value={composeData.secretKey}
                                                onChange={(e) => setComposeData({ ...composeData, secretKey: e.target.value })}
                                                placeholder="Enter or generate secret key"
                                                disabled={isSending}
                                                className="flex-1 px-2.5 py-1.5 bg-zinc-950 border border-zinc-800 rounded-md text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-emerald-500 disabled:opacity-50 font-mono text-xs"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const hexChars = '0123456789abcdef';
                                                    let key = '';
                                                    for (let i = 0; i < 40; i++) {
                                                        key += hexChars.charAt(Math.floor(Math.random() * hexChars.length));
                                                    }
                                                    setComposeData({ ...composeData, secretKey: key });
                                                }}
                                                disabled={isSending}
                                                className="px-3 bg-zinc-800 border border-zinc-700 rounded-md text-zinc-400 hover:text-emerald-400 hover:border-emerald-500/50 transition-colors disabled:opacity-50"
                                                title="Generate random key"
                                            >
                                                <Dices className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                    <div className="flex-1 space-y-2">
                                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Hint</label>
                                        <input
                                            type="text"
                                            value={composeData.hint}
                                            onChange={(e) => setComposeData({ ...composeData, hint: e.target.value })}
                                            placeholder="Optional hint for recipient"
                                            disabled={isSending}
                                            className="w-full px-2.5 py-1.5 bg-zinc-950 border border-zinc-800 rounded-md text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-emerald-500 disabled:opacity-50 text-xs"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="p-4 min-h-[400px]">
                                <textarea
                                    value={composeData.body}
                                    onChange={(e) => setComposeData({ ...composeData, body: e.target.value })}
                                    placeholder="Write your secure message..."
                                    disabled={isSending}
                                    className="w-full h-full min-h-[400px] bg-transparent text-zinc-300 text-sm leading-relaxed placeholder-zinc-600 focus:outline-none resize-none disabled:opacity-50"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (view === 'read' && selectedEmail) {
        return (
            <div className="space-y-3 animate-fade-in h-[calc(100vh-2rem)] flex flex-col overflow-hidden">
                <div className="flex-1 flex flex-col bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
                    {/* Email Header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-950/30">
                        <div className="flex items-center gap-3">
                            <button
                                onClick={handleBack}
                                className="p-1.5 text-zinc-400 hover:text-zinc-50 hover:bg-zinc-800 rounded-md transition-colors"
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                            <h1 className="text-sm font-bold text-zinc-200 truncate">{selectedEmail.subject}</h1>
                        </div>
                        <div className="flex items-center gap-1">
                            <button className="p-1.5 text-zinc-400 hover:text-zinc-50 hover:bg-zinc-800 rounded-md transition-colors" title="Reply">
                                <Reply className="w-3.5 h-3.5" />
                            </button>
                            <button className="p-1.5 text-zinc-400 hover:text-zinc-50 hover:bg-zinc-800 rounded-md transition-colors" title="Delete">
                                <Trash2 className="w-3.5 h-3.5" />
                            </button>
                            <button className="p-1.5 text-zinc-400 hover:text-zinc-50 hover:bg-zinc-800 rounded-md transition-colors">
                                <MoreVertical className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    </div>

                    {/* Email Meta */}
                    <div className="px-4 py-3 border-b border-zinc-800/50 bg-zinc-900/50">
                        <div className="flex items-start justify-between">
                            <div>
                                <div className="flex items-center gap-2 mb-0.5">
                                    <h3 className="text-sm font-bold text-zinc-50">{selectedEmail.sender}</h3>
                                    <span className="text-xs text-zinc-500">{'<'}{selectedEmail.senderEmail}{'>'}</span>
                                    {selectedEmail.encrypted && (
                                        <span className="px-1.5 py-0.5 bg-emerald-500/10 text-emerald-500 text-[10px] uppercase font-bold rounded border border-emerald-500/20">
                                            Encrypted
                                        </span>
                                    )}
                                </div>
                                <div className="text-xs text-zinc-400">
                                    To: {selectedEmail.recipient}
                                </div>
                            </div>
                            <div className="text-xs text-zinc-500 font-mono">{selectedEmail.date}</div>
                        </div>
                    </div>

                    {/* Email Body */}
                    <div className="flex-1 p-6 overflow-y-auto">
                        <div className="max-w-4xl mx-auto">
                            <div className="prose prose-sm prose-invert max-w-none">
                                <p className="text-zinc-300 whitespace-pre-wrap leading-relaxed">{selectedEmail.body}</p>
                            </div>

                            {selectedEmail.attachments && selectedEmail.attachments.length > 0 && (
                                <div className="mt-8 pt-4 border-t border-zinc-800">
                                    <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Attachments</h4>
                                    <div className="space-y-2">
                                        {selectedEmail.attachments.map((attachment, idx) => (
                                            <div key={idx} className="flex items-center gap-2 p-2 bg-zinc-950/50 rounded border border-zinc-800 mb-1">
                                                <Paperclip className="w-3.5 h-3.5 text-zinc-400" />
                                                <span className="text-xs text-zinc-300 font-mono">{attachment}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Main List View
    return (
        <>
            {/* Matrix-Style Toast Notification */}
            {toast.show && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-sm animate-fade-in">
                    <div className={`
                        relative max-w-md w-full bg-zinc-900 border rounded-xl p-6 shadow-2xl
                        ${toast.type === 'success' ? 'border-emerald-500/50' : ''}
                        ${toast.type === 'warning' ? 'border-yellow-500/50' : ''}
                        ${toast.type === 'error' ? 'border-red-500/50' : ''}
                    `}>
                        {/* Matrix rain effect background */}
                        <div className="absolute inset-0 overflow-hidden rounded-xl opacity-10">
                            <div className="absolute inset-0 bg-gradient-to-b from-emerald-500/20 to-transparent"></div>
                        </div>

                        {/* Content */}
                        <div className="relative">
                            {/* Icon */}
                            <div className={`
                                w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center
                                ${toast.type === 'success' ? 'bg-emerald-500/20' : ''}
                                ${toast.type === 'warning' ? 'bg-yellow-500/20' : ''}
                                ${toast.type === 'error' ? 'bg-red-500/20' : ''}
                            `}>
                                {toast.type === 'success' && <Lock className="w-8 h-8 text-emerald-500" />}
                                {toast.type === 'warning' && <AlertCircle className="w-8 h-8 text-yellow-500" />}
                                {toast.type === 'error' && <X className="w-8 h-8 text-red-500" />}
                            </div>

                            {/* Title */}
                            <h3 className={`
                                text-xl font-bold text-center mb-2
                                ${toast.type === 'success' ? 'text-emerald-400' : ''}
                                ${toast.type === 'warning' ? 'text-yellow-400' : ''}
                                ${toast.type === 'error' ? 'text-red-400' : ''}
                            `}>
                                {toast.title}
                            </h3>

                            {/* Message */}
                            <p className="text-zinc-400 text-center text-sm mb-6">
                                {toast.message}
                            </p>

                            {/* Transaction Info */}
                            {toast.txHash && (
                                <div className="bg-zinc-800/50 rounded-lg p-3 mb-4 font-mono text-xs">
                                    <div className="flex items-center gap-2 text-zinc-500 mb-1">
                                        <span>Transaction Hash:</span>
                                    </div>
                                    <div className="text-emerald-400 truncate">
                                        {toast.txHash}
                                    </div>
                                </div>
                            )}

                            {/* Buttons */}
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setToast({ ...toast, show: false })}
                                    className="flex-1 px-4 py-2.5 bg-zinc-800 text-zinc-300 rounded-lg hover:bg-zinc-700 transition-colors font-medium"
                                >
                                    OK
                                </button>
                                {toast.txHash && toast.explorerUrl && (
                                    <button
                                        onClick={() => {
                                            window.open(toast.explorerUrl!, '_blank');
                                            setToast({ ...toast, show: false });
                                        }}
                                        className="flex-1 px-4 py-2.5 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors font-medium flex items-center justify-center gap-2"
                                    >
                                        <ExternalLink className="w-4 h-4" />
                                        View Txn
                                    </button>
                                )}
                            </div>

                            {/* TEE Badge */}
                            <div className="mt-4 flex items-center justify-center gap-2 text-xs text-zinc-500">
                                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                                <span>Secured by TEE • Sapphire Testnet</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="space-y-3 animate-fade-in h-[calc(100vh-2rem)] flex flex-col overflow-hidden relative">
                {/* Coming Soon Banner */}
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-30 pointer-events-none">
                    <div className="bg-gradient-to-r from-blue-500/70 to-emerald-500/70 text-white px-8 py-4 rounded-xl shadow-2xl border border-blue-400/30 backdrop-blur-sm">
                        <p className="text-2xl font-black tracking-wide text-center">COMING SOON</p>
                        <p className="text-xs text-blue-100/80 text-center mt-1">Private Mail is under development</p>
                    </div>
                </div>

                <div className="flex-1 flex bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden opacity-60 pointer-events-none">
                    {/* Sidebar */}
                    <div className="w-56 bg-zinc-950/50 border-r border-zinc-800 flex flex-col">
                        {/* Compose Button (COMING SOON) */}
                        <div className="p-3">
                            <button
                                disabled
                                className="w-full px-3 py-2 bg-zinc-700 text-zinc-400 rounded-lg cursor-not-allowed flex items-center justify-center gap-2 text-sm font-bold opacity-60"
                            >
                                <Edit3 className="w-4 h-4" />
                                Compose
                            </button>
                        </div>

                        {/* Folders */}
                        <nav className="flex-1 px-2 space-y-0.5 overflow-y-auto">
                            {folders.map((folder) => {
                                const Icon = folder.icon;
                                const isActive = selectedFolder === folder.id;

                                return (
                                    <button
                                        key={folder.id}
                                        onClick={() => setSelectedFolder(folder.id)}
                                        className={`
                  w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors
                  ${isActive
                                                ? 'bg-zinc-800 text-emerald-500'
                                                : 'text-zinc-400 hover:text-zinc-50 hover:bg-zinc-800/50'
                                            }
                `}
                                    >
                                        <div className="flex items-center gap-2.5">
                                            <Icon className="w-4 h-4" />
                                            <span className="text-xs font-medium">{folder.name}</span>
                                        </div>
                                        {folder.count > 0 && (
                                            <span className={`
                    px-1.5 py-0.5 rounded text-[10px] font-bold
                    ${isActive ? 'bg-emerald-500/20 text-emerald-500' : 'bg-zinc-800 text-zinc-500'}
                  `}>
                                                {folder.count}
                                            </span>
                                        )}
                                    </button>
                                );
                            })}

                            <div className="h-px bg-zinc-800/50 my-2 mx-2"></div>

                            {/* Chain Sync Controls */}
                            <div className="px-2 pb-2">
                                <h3 className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider mb-2 flex items-center gap-1.5 px-1">
                                    <Cloud className="w-3 h-3" />
                                    Sync History
                                </h3>
                                <div className="grid grid-cols-2 gap-1.5">
                                    <button
                                        disabled
                                        className="px-2 py-1.5 bg-zinc-900 border border-zinc-800 text-zinc-600 rounded-md text-[10px] font-medium flex flex-col items-center gap-1 opacity-50 cursor-not-allowed"
                                    >
                                        <Upload className="w-3 h-3" />
                                        Backup
                                    </button>
                                    <button
                                        disabled
                                        className="px-2 py-1.5 bg-zinc-900 border border-zinc-800 text-zinc-600 rounded-md text-[10px] font-medium flex flex-col items-center gap-1 opacity-50 cursor-not-allowed"
                                    >
                                        <Download className="w-3 h-3" />
                                        Restore
                                    </button>
                                </div>
                            </div>

                            <div className="h-px bg-zinc-800/50 my-2 mx-2"></div>

                            {/* Disposable Identities */}
                            <div className="px-2">
                                <div className="flex items-center justify-between mb-2 px-1">
                                    <h3 className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider flex items-center gap-1.5">
                                        <VenetianMask className="w-3 h-3" />
                                        Identities
                                    </h3>
                                    <button
                                        onClick={handleCreateAlias}
                                        className="text-emerald-500 hover:text-emerald-400 p-0.5 hover:bg-emerald-500/10 rounded transition-colors"
                                        title="New Alias"
                                    >
                                        <Plus className="w-3 h-3" />
                                    </button>
                                </div>

                                <div className="space-y-1">
                                    {aliases.map(alias => (
                                        <div key={alias} className="group flex items-center justify-between p-1.5 bg-zinc-900/50 rounded-md border border-zinc-800/50 hover:border-zinc-700 hover:bg-zinc-900 transition-all">
                                            <div className="overflow-hidden flex-1 min-w-0 mr-2">
                                                <p className="text-[10px] text-zinc-400 font-mono truncate" title={alias}>
                                                    {alias}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={() => {
                                                        navigator.clipboard.writeText(alias);
                                                        setToast({ show: true, type: 'success', title: 'Copied', message: 'Alias copied' });
                                                    }}
                                                    className="p-1 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 rounded"
                                                    title="Copy"
                                                >
                                                    <Copy className="w-2.5 h-2.5" />
                                                </button>
                                                <button
                                                    onClick={() => handleSimulateIncoming(alias)}
                                                    className="p-1 text-zinc-500 hover:text-emerald-400 hover:bg-emerald-500/10 rounded"
                                                    title="Test Email"
                                                >
                                                    <Play className="w-2.5 h-2.5" />
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteAlias(alias)}
                                                    className="p-1 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded"
                                                    title="Burn"
                                                >
                                                    <Trash2 className="w-2.5 h-2.5" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                    {aliases.length === 0 && (
                                        <div className="text-[10px] text-zinc-700 italic text-center py-2">
                                            No active aliases
                                        </div>
                                    )}
                                </div>
                            </div>
                        </nav>
                    </div>

                    {/* Main Content */}
                    <div className="flex-1 flex flex-col bg-zinc-900 min-w-0">
                        {/* Search Bar */}
                        <div className="p-3 border-b border-zinc-800 bg-zinc-900/50">
                            <div className="relative">
                                <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
                                <input
                                    type="text"
                                    placeholder="Search encrypted mail..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full pl-8 pr-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-50 placeholder-zinc-600 focus:outline-none focus:border-emerald-500 transition-all"
                                />
                            </div>
                        </div>

                        {/* Email List */}
                        <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-800">
                            {filteredEmails.length === 0 ? (
                                <div className="flex items-center justify-center h-full">
                                    <div className="text-center opacity-50">
                                        <div className="w-12 h-12 bg-zinc-800/50 rounded-full flex items-center justify-center mx-auto mb-3">
                                            <Mail className="w-5 h-5 text-zinc-600" />
                                        </div>
                                        <p className="text-xs text-zinc-500">No emails in {selectedFolder}</p>
                                    </div>
                                </div>
                            ) : (
                                <div className="divide-y divide-zinc-800/50">
                                    {filteredEmails.map((email) => (
                                        <div
                                            key={email.id}
                                            onClick={() => handleEmailClick(email)}
                                            className={`
                    flex items-start gap-3 p-3 cursor-pointer transition-colors group
                    ${!email.read ? 'bg-zinc-800/20' : 'hover:bg-zinc-800/30'}
                  `}
                                        >
                                            <div className="flex-shrink-0 pt-0.5">
                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border ${!email.read ? 'bg-emerald-500 text-white border-emerald-400' : 'bg-zinc-800 text-zinc-500 border-zinc-700'}`}>
                                                    {email.sender.charAt(0).toUpperCase()}
                                                </div>
                                            </div>

                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between mb-0.5">
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <h3 className={`text-sm font-medium truncate ${!email.read ? 'text-zinc-100' : 'text-zinc-400'}`}>
                                                            {email.sender}
                                                        </h3>
                                                        {email.encrypted && (
                                                            <Lock className="w-3 h-3 text-emerald-500 flex-shrink-0" />
                                                        )}
                                                    </div>
                                                    <span className={`text-[10px] flex-shrink-0 ${!email.read ? 'text-emerald-400' : 'text-zinc-600'}`}>
                                                        {email.date.split(',')[0]}
                                                    </span>
                                                </div>

                                                <h4 className={`text-xs mb-0.5 truncate ${!email.read ? 'text-zinc-300 font-medium' : 'text-zinc-500'}`}>
                                                    {email.subject}
                                                </h4>

                                                <p className="text-[10px] text-zinc-600 truncate">
                                                    {email.encrypted ? 'Protected by TEE Encryption' : email.body.replace(/\n/g, ' ')}
                                                </p>
                                            </div>

                                            {email.txHash && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        window.open(email.explorerUrl || `https://explorer.oasis.io/${network === 'mainnet' ? 'mainnet' : 'testnet'}/sapphire/tx/${email.txHash}`, '_blank');
                                                    }}
                                                    className="p-1 text-zinc-600 hover:text-blue-400 hover:bg-blue-500/10 rounded transition-colors opacity-0 group-hover:opacity-100"
                                                    title="View Blockchain Record"
                                                >
                                                    <ExternalLink className="w-3 h-3" />
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}