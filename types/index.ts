export interface Email {
    id: string;
    subject: string;
    sender: string;
    senderEmail: string;
    recipient: string;
    recipientEmail: string;
    date: string;
    body: string;
    encrypted: boolean;
    folder: 'inbox' | 'sent';
    read: boolean;
    starred: boolean;
    attachments?: string[];
    txHash?: string | null;
    explorerUrl?: string | null;
    isExternal?: boolean;
    senderEmailFull?: string;
}

export interface ApiKey {
    id: string;
    name: string;
    secret: string;
    scopes: string[];
    lastUsed: string;
}

export interface SecretItem {
    id: string;
    name: string;
    username: string;
    password: string;
    url?: string;
}

export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
    senderAvatar?: {
        seed: string; // DiceBear seed
    };
}

export interface StatCard {
    title: string;
    value: string;
    icon: string;
    color: string;
}

export interface ChartData {
    time: string;
    value: number;
}

export interface NodeHealth {
    name: string;
    health: number;
}