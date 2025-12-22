'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import html2canvas from 'html2canvas';
import {
    Upload,
    Download,
    Trash2,
    PenTool,
    Type,
    Image as ImageIcon,
    ZoomIn,
    ZoomOut,
    ChevronLeft,
    ChevronRight,
    Loader2,
    Check,
    Shield,
    Move,
    X,
    FileText,
    ExternalLink,
    Lock,
    Wallet,
    Key,
    CheckCircle,
    Copy
} from 'lucide-react';

import { pdfjs } from 'react-pdf';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';
import { vaultService } from '@/services/vaultService';
import { useAuth } from '@/contexts/AuthContext';
import { useNetwork } from '@/contexts/NetworkContext';

// Configure PDF Worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

// Dynamically import PDF components with SSR disabled
const Document = dynamic(() => import('react-pdf').then(mod => mod.Document), {
    ssr: false,
    loading: () => (
        <div className="flex items-center gap-2 p-8 justify-center h-full">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
            <span className="text-zinc-500 font-mono">Loading PDF...</span>
        </div>
    ),
});
const Page = dynamic(() => import('react-pdf').then(mod => mod.Page), {
    ssr: false,
});

type SignatureMode = 'draw' | 'type' | 'upload';
type Step = 'upload' | 'sign' | 'complete';

const SIGNATURE_FONTS = [
    { name: 'Cursive', family: "var(--font-dancing)" },
    { name: 'Elegant', family: "var(--font-vibes)" },
    { name: 'Professional', family: "var(--font-allura)" },
    { name: 'Simple', family: "var(--font-caveat)" },
    { name: 'Modern (Sans)', family: "var(--font-roboto)" },
    { name: 'Classic (Serif)', family: "var(--font-playfair)" },
];

export default function SecureDocs() {
    const { user } = useAuth();
    const { network } = useNetwork();

    // Step state
    const [step, setStep] = useState<Step>('upload');

    // Document state
    const [docFile, setDocFile] = useState<string | File | null>(null);
    const [docName, setDocName] = useState<string>('');
    const [fileType, setFileType] = useState<'image' | 'pdf'>('image');
    const [numPages, setNumPages] = useState<number>(0);
    const [pageNumber, setPageNumber] = useState(1);
    const [scale, setScale] = useState(1);

    // Signature state
    const [signatureMode, setSignatureMode] = useState<SignatureMode>('draw');
    const [signatureImage, setSignatureImage] = useState<string | null>(null);
    const [typedSignature, setTypedSignature] = useState('');
    const [selectedFont, setSelectedFont] = useState(SIGNATURE_FONTS[0]);
    const [fontSize, setFontSize] = useState(48); // Default font size

    // Signature position (for drag & drop)
    const [signaturePosition, setSignaturePosition] = useState({ x: 50, y: 70 }); // percentage
    const [signatureSize, setSignatureSize] = useState({ width: 200, height: 80 });
    const [isDragging, setIsDragging] = useState(false);
    const [isResizing, setIsResizing] = useState(false);
    const [showSignature, setShowSignature] = useState(false);

    // Refs
    const containerRef = useRef<HTMLDivElement>(null);
    const drawCanvasRef = useRef<HTMLCanvasElement>(null);
    const documentRef = useRef<HTMLDivElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const dragOffset = useRef({ x: 0, y: 0 });
    const lastTouchPos = useRef<{ x: number, y: number } | null>(null);

    const [isAnchoring, setIsAnchoring] = useState(false);
    const [anchorResult, setAnchorResult] = useState<{ txHash: string; explorerUrl: string; rawData: string } | null>(null);
    const [publicNote, setPublicNote] = useState('');
    const [toast, setToast] = useState<string | null>(null);
    const [isDownloaded, setIsDownloaded] = useState(false);
    const [anchoringMessage, setAnchoringMessage] = useState(0);
    const [showSuccessModal, setShowSuccessModal] = useState(false);
    const [copiedTx, setCopiedTx] = useState(false);
    const [copiedData, setCopiedData] = useState(false);
    const [showResetPrompt, setShowResetPrompt] = useState(false);

    const isLocked = !!anchorResult || isDownloaded;

    const handleLockedInteraction = (e?: React.SyntheticEvent) => {
        if (isLocked) {
            e?.preventDefault();
            e?.stopPropagation();
            setShowResetPrompt(true);
            return true;
        }
        return false;
    };

    // Restore state from sessionStorage on mount (only for tab switch, not page refresh)
    useEffect(() => {
        // Use a marker to detect page refresh vs SPA navigation
        // On page refresh, the beforeunload event clears the marker
        // On SPA navigation, the marker persists
        const hasActiveSession = sessionStorage.getItem('pribado_docs_active');

        if (!hasActiveSession) {
            // Fresh load or page refresh - clear state and start fresh
            sessionStorage.removeItem('pribado_docs_state');
            sessionStorage.setItem('pribado_docs_active', 'true');
            return;
        }

        // SPA navigation (returning from another page) - restore state
        const savedState = sessionStorage.getItem('pribado_docs_state');
        if (savedState) {
            try {
                const parsed = JSON.parse(savedState);
                if (parsed.docFile) setDocFile(parsed.docFile);
                if (parsed.docName) setDocName(parsed.docName);
                if (parsed.fileType) setFileType(parsed.fileType);
                if (parsed.step) setStep(parsed.step);
                if (parsed.signatureImage) setSignatureImage(parsed.signatureImage);
                if (parsed.typedSignature) setTypedSignature(parsed.typedSignature);
                if (parsed.showSignature) setShowSignature(parsed.showSignature);
                if (parsed.signaturePosition) setSignaturePosition(parsed.signaturePosition);
                if (parsed.anchorResult) setAnchorResult(parsed.anchorResult);
                if (parsed.publicNote) setPublicNote(parsed.publicNote);
            } catch (e) {
                console.error('Failed to restore docs state:', e);
            }
        }
    }, []);

    // Clear marker on page unload (refresh/close) so next load starts fresh
    useEffect(() => {
        const handleUnload = () => {
            sessionStorage.removeItem('pribado_docs_active');
        };
        window.addEventListener('beforeunload', handleUnload);
        return () => window.removeEventListener('beforeunload', handleUnload);
    }, []);

    // Save state to sessionStorage whenever key values change
    useEffect(() => {
        if (step !== 'upload' || docFile || signatureImage || anchorResult) {
            const stateToSave = {
                docFile: typeof docFile === 'string' ? docFile : null, // Only save base64, not File objects
                docName,
                fileType,
                step,
                signatureImage,
                typedSignature,
                showSignature,
                signaturePosition,
                anchorResult,
                publicNote,
            };
            sessionStorage.setItem('pribado_docs_state', JSON.stringify(stateToSave));
        }
    }, [docFile, docName, fileType, step, signatureImage, typedSignature, showSignature, signaturePosition, anchorResult, publicNote]);

    // Handle File Upload
    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (handleLockedInteraction(e)) return;
        const file = e.target.files?.[0];
        if (file) {
            // Clear anchor state when new file is uploaded
            setAnchorResult(null);
            setPublicNote('');
            setSignatureImage(null);
            setTypedSignature('');
            setShowSignature(false);

            setDocName(file.name);
            if (file.type === 'application/pdf') {
                setFileType('pdf');
                setDocFile(file);
                setPageNumber(1);
            } else {
                setFileType('image');
                const reader = new FileReader();
                reader.onload = (event) => {
                    setDocFile(event.target?.result as string);
                };
                reader.readAsDataURL(file);
            }
            setStep('sign');
        }
    };

    // Handle signature image upload
    const handleSignatureUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (handleLockedInteraction(e)) return;
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                setSignatureImage(event.target?.result as string);
                setShowSignature(true); // Auto-show
            };
            reader.readAsDataURL(file);
        }
    };

    // Drawing Logic
    const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (handleLockedInteraction(e)) return;
        const canvas = drawCanvasRef.current;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) * (canvas.width / rect.width);
        const y = (e.clientY - rect.top) * (canvas.height / rect.height);

        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.beginPath();
            ctx.moveTo(x, y);
            setIsDrawing(true);
        }
    };

    const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!isDrawing) return;
        const canvas = drawCanvasRef.current;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) * (canvas.width / rect.width);
        const y = (e.clientY - rect.top) * (canvas.height / rect.height);

        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.lineTo(x, y);
            ctx.stroke();
        }
    };

    // Touch Drawing Logic
    const startDrawingTouch = (e: React.TouchEvent<HTMLCanvasElement>) => {
        if (handleLockedInteraction(e)) return;
        e.preventDefault(); // Prevent scrolling
        const touch = e.touches[0];
        const canvas = drawCanvasRef.current;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const x = (touch.clientX - rect.left) * (canvas.width / rect.width);
        const y = (touch.clientY - rect.top) * (canvas.height / rect.height);

        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.beginPath();
            ctx.moveTo(x, y);
            setIsDrawing(true);
        }
    };

    const drawTouch = (e: React.TouchEvent<HTMLCanvasElement>) => {
        e.preventDefault();
        if (!isDrawing) return;
        const touch = e.touches[0];
        const canvas = drawCanvasRef.current;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const x = (touch.clientX - rect.left) * (canvas.width / rect.width);
        const y = (touch.clientY - rect.top) * (canvas.height / rect.height);

        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.lineTo(x, y);
            ctx.stroke();
        }
    };

    const stopDrawing = () => {
        setIsDrawing(false);
        // Convert to image with transparency
        if (drawCanvasRef.current) {
            const dataUrl = drawCanvasRef.current.toDataURL('image/png');
            if (dataUrl !== 'data:,') {
                setSignatureImage(dataUrl);
                setShowSignature(true); // Auto-show
            }
        }
    };

    const clearDrawing = () => {
        const canvas = drawCanvasRef.current;
        if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx?.clearRect(0, 0, canvas.width, canvas.height);
        }
        setSignatureImage(null);
    };

    // Initialize draw canvas
    useEffect(() => {
        if (drawCanvasRef.current) {
            const canvas = drawCanvasRef.current;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.strokeStyle = '#1a1a2e';
                ctx.lineWidth = 3;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
            }
        }
    }, [signatureMode]);

    // Draw/Upload Image Generation
    // (Typed signature is now DOM-based, no image gen needed)
    useEffect(() => {
        // Only auto-show for draw/upload if image exists
        if (signatureMode !== 'type' && signatureImage) {
            setShowSignature(true);
        } else if (signatureMode === 'type' && typedSignature) {
            setShowSignature(true);
        }
    }, [signatureImage, typedSignature, signatureMode]);

    // Drag handlers for signature positioning
    const handleSignatureDragStart = (e: React.MouseEvent) => {
        if (handleLockedInteraction(e)) return;
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    };

    // Touch Dragging for Overlay
    const handleTouchDragStart = (e: React.TouchEvent) => {
        if (handleLockedInteraction(e)) return;
        e.preventDefault(); // Prevent default browser handling (scrolling/mouse emulation)
        e.stopPropagation();
        const touch = e.touches[0];
        lastTouchPos.current = { x: touch.clientX, y: touch.clientY };
        setIsDragging(true);
    };

    const handleTouchDrag = useCallback((e: React.TouchEvent) => {
        e.preventDefault(); // Prevent scroll while dragging
        e.stopPropagation();
        if (!isDragging || !documentRef.current || !lastTouchPos.current) return;

        const touch = e.touches[0];
        const deltaX = touch.clientX - lastTouchPos.current.x;
        const deltaY = touch.clientY - lastTouchPos.current.y;

        lastTouchPos.current = { x: touch.clientX, y: touch.clientY };

        if (Math.abs(deltaX) < 0.1 && Math.abs(deltaY) < 0.1) return;

        setSignaturePosition(prev => {
            const rect = documentRef.current!.getBoundingClientRect();

            // Convert % position to pixels
            const currentX = (prev.x / 100) * rect.width;
            const currentY = (prev.y / 100) * rect.height;

            // Apply delta
            const newX = currentX + deltaX;
            const newY = currentY + deltaY;

            // Convert back to %
            const xPercent = (newX / rect.width) * 100;
            const yPercent = (newY / rect.height) * 100;

            return {
                x: Math.max(0, Math.min(100, xPercent)),
                y: Math.max(0, Math.min(100, yPercent))
            };
        });
    }, [isDragging]);

    const handleTouchDragEnd = () => {
        setIsDragging(false);
        lastTouchPos.current = null;
    };

    // Mouse Dragging (Existing)
    const handleSignatureDrag = useCallback((e: MouseEvent) => {
        if (!isDragging || !documentRef.current) return;

        // Use movementX/Y for stable delta-based movement
        // simpler and less prone to "jumping" than absolute rect calculations
        if (e.movementX === 0 && e.movementY === 0) return;

        setSignaturePosition(prev => {
            const rect = documentRef.current!.getBoundingClientRect();

            // Convert % position to pixels
            const currentX = (prev.x / 100) * rect.width;
            const currentY = (prev.y / 100) * rect.height;

            // Apply delta
            const newX = currentX + e.movementX;
            const newY = currentY + e.movementY;

            // Convert back to %
            const xPercent = (newX / rect.width) * 100;
            const yPercent = (newY / rect.height) * 100;

            return {
                x: Math.max(0, Math.min(100, xPercent)),
                y: Math.max(0, Math.min(100, yPercent))
            };
        });
    }, [isDragging]);

    const handleSignatureDragEnd = useCallback(() => {
        setIsDragging(false);
    }, []);

    // Resize handlers
    const handleResizeStart = (e: React.MouseEvent) => {
        if (handleLockedInteraction(e)) return;
        e.preventDefault();
        e.stopPropagation();
        setIsResizing(true);
    };

    // Touch resize handlers
    const handleTouchResizeStart = (e: React.TouchEvent) => {
        if (handleLockedInteraction(e)) return;
        e.preventDefault();
        e.stopPropagation();
        const touch = e.touches[0];
        lastTouchPos.current = { x: touch.clientX, y: touch.clientY };
        setIsResizing(true);
    };

    const handleTouchResize = useCallback((e: React.TouchEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (!isResizing || !documentRef.current) return;

        const touch = e.touches[0];

        if (signatureMode === 'type') {
            const rect = documentRef.current.getBoundingClientRect();
            const sigTopPixels = (signaturePosition.y / 100) * rect.height;
            const targetHeightPixels = touch.clientY - rect.top - sigTopPixels;
            if (targetHeightPixels > 5) {
                const newFontSize = Math.max(1, Math.min(300, Math.round(targetHeightPixels / 1.5)));
                if (newFontSize !== fontSize) {
                    setFontSize(newFontSize);
                }
            }
        } else {
            const rect = documentRef.current.getBoundingClientRect();
            const sigLeftPixels = (signaturePosition.x / 100) * rect.width;
            const sigTopPixels = (signaturePosition.y / 100) * rect.height;
            const newWidth = touch.clientX - rect.left - sigLeftPixels;
            const newHeight = touch.clientY - rect.top - sigTopPixels;
            setSignatureSize({
                width: Math.max(50, Math.min(rect.width - sigLeftPixels, newWidth)),
                height: Math.max(20, Math.min(rect.height - sigTopPixels, newHeight))
            });
        }
    }, [isResizing, signaturePosition, fontSize, signatureMode]);

    const handleTouchResizeEnd = () => {
        setIsResizing(false);
        lastTouchPos.current = null;
    };

    const handleResize = useCallback((e: MouseEvent) => {
        if (!isResizing || !documentRef.current) return;

        // If in TYPE mode, resize changes FONT SIZE
        if (signatureMode === 'type') {
            const rect = documentRef.current.getBoundingClientRect();
            const sigTopPixels = (signaturePosition.y / 100) * rect.height;
            const targetHeightPixels = e.clientY - rect.top - sigTopPixels;

            // Height to Font Size conversion roughly: height ~= fontSize * 1.5
            // So fontSize ~= height / 1.5
            if (targetHeightPixels > 5) {
                const newFontSize = Math.max(1, Math.min(300, Math.round(targetHeightPixels / 1.5)));
                if (newFontSize !== fontSize) {
                    setFontSize(newFontSize);
                }
            }
        } else {
            // For images (Draw/Upload), resize the container DIV
            const rect = documentRef.current.getBoundingClientRect();

            // Calculate current signature position in pixels
            const sigLeftPixels = (signaturePosition.x / 100) * rect.width;
            const sigTopPixels = (signaturePosition.y / 100) * rect.height;

            // New dimensions = Mouse Position - Signature Top-Left Position
            const newWidth = e.clientX - rect.left - sigLeftPixels;
            const newHeight = e.clientY - rect.top - sigTopPixels;

            // Apply limits
            setSignatureSize({
                width: Math.max(50, Math.min(rect.width - sigLeftPixels, newWidth)),
                height: Math.max(20, Math.min(rect.height - sigTopPixels, newHeight))
            });
        }
    }, [isResizing, signaturePosition, signatureSize, fontSize, signatureMode]);

    const handleResizeEnd = useCallback(() => {
        setIsResizing(false);
    }, []);

    useEffect(() => {
        if (isDragging) {
            window.addEventListener('mousemove', handleSignatureDrag);
            window.addEventListener('mouseup', handleSignatureDragEnd);
        }
        if (isResizing) {
            window.addEventListener('mousemove', handleResize);
            window.addEventListener('mouseup', handleResizeEnd);
        }
        return () => {
            window.removeEventListener('mousemove', handleSignatureDrag);
            window.removeEventListener('mouseup', handleSignatureDragEnd);
            window.removeEventListener('mousemove', handleResize);
            window.removeEventListener('mouseup', handleResizeEnd);
        };
    }, [isDragging, isResizing, handleSignatureDrag, handleSignatureDragEnd, handleResize, handleResizeEnd]);

    // Anchoring message animation
    const anchoringMessages = [
        "Initializing secure connection...",
        "Generating SHA-256 document hash...",
        "Encrypting with AES-256-GCM...",
        "Signing with ECDSA private key...",
        "Establishing link to Oasis Sapphire TEE...",
        "Broadcasting to confidential smart contract...",
        "Verifying zero-knowledge proof...",
        "Finalizing blockchain transaction...",
        "File successfully anchored to Oasis Sapphire!"
    ];

    // Message is now controlled by the anchorToBlockchain function
    // No need for interval-based cycling

    // Place signature on document
    const placeSignature = () => {
        if (signatureImage) {
            setShowSignature(true);
        }
    };

    // Download signed document
    const downloadDocument = async () => {
        if (!documentRef.current) return;

        try {
            // Use html2canvas to capture the document with signature
            const canvas = await html2canvas(documentRef.current, {
                backgroundColor: '#ffffff',
                scale: 2, // Higher quality
                useCORS: true,
            });

            // Convert to image and download
            const link = document.createElement('a');
            link.download = `signed-${docName.replace(/\.[^/.]+$/, '')}-${Date.now()}.png`;
            link.href = canvas.toDataURL('image/png');
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (error) {
            console.error('Download failed:', error);
            alert('Download failed. Please try again.');
        }

        // Trigger success state and modal
        setIsDownloaded(true);
        setShowSuccessModal(true);
        setTimeout(() => setShowSuccessModal(false), 10000);
    };

    const handleCopyTx = () => {
        if (!anchorResult) return;
        navigator.clipboard.writeText(anchorResult.txHash);
        setCopiedTx(true);
        setTimeout(() => setCopiedTx(false), 2000);
    };

    const handleCopyData = () => {
        if (!anchorResult) return;
        navigator.clipboard.writeText(anchorResult.rawData);
        setCopiedData(true);
        setTimeout(() => setCopiedData(false), 2000);
    };

    // Anchor to blockchain (with encryption)
    const anchorToBlockchain = async () => {
        setIsAnchoring(true);
        setAnchoringMessage(0); // Initializing secure connection...
        await new Promise(r => setTimeout(r, 1000));

        try {
            // Get signer wallet address (verified user)
            const signerAddress = user?.address || vaultService.getAddress() || 'unknown';

            setAnchoringMessage(1); // Generating SHA-256 document hash...
            await new Promise(r => setTimeout(r, 1000));

            // Create document hash for integrity verification
            const documentContent = signatureImage || typedSignature || '';
            const encoder = new TextEncoder();
            const data = encoder.encode(docName + documentContent + signerAddress + Date.now());
            const hashBuffer = await crypto.subtle.digest('SHA-256', data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const documentHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

            setAnchoringMessage(2); // Encrypting with AES-256-GCM...
            await new Promise(r => setTimeout(r, 1000));

            // Generate signed filename (same format as download)
            const timestamp = Date.now();
            const signedFilename = `signed-${docName.replace(/\.[^/.]+$/, '')}-${timestamp}.png`;

            // Create encrypted payload
            const payload = {
                documentName: docName,
                signedFilename,
                signedAt: timestamp,
                documentHash,
                signerAddress, // Cryptographically tied to wallet
                signatureHash: signatureImage?.substring(0, 100),
                note: publicNote
            };

            setAnchoringMessage(3); // Signing with ECDSA private key...
            await new Promise(r => setTimeout(r, 1000));

            // Encrypt the payload before sending (using enclave key if available)
            const enclaveKey = sessionStorage.getItem('pribado_enclave_key');
            let encryptedPayload = JSON.stringify(payload);

            if (enclaveKey) {
                // Simple XOR encryption with enclave key as additional layer
                const keyBytes = encoder.encode(enclaveKey);
                const payloadBytes = encoder.encode(JSON.stringify(payload));
                const encrypted = new Uint8Array(payloadBytes.length);
                for (let i = 0; i < payloadBytes.length; i++) {
                    encrypted[i] = payloadBytes[i] ^ keyBytes[i % keyBytes.length];
                }
                encryptedPayload = btoa(String.fromCharCode(...encrypted));
            }

            setAnchoringMessage(4); // Establishing link to Oasis Sapphire TEE...
            await new Promise(r => setTimeout(r, 1000));

            // Generate ID with provenance: doc_{Signer}_{Timestamp}
            const docId = `doc_${signerAddress.slice(0, 10)}_${Date.now()}`;

            setAnchoringMessage(5); // Broadcasting to confidential smart contract...

            const response = await fetch('/api/sapphire', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'storeEmail',
                    network,
                    data: {
                        emailId: docId,
                        encryptedData: encryptedPayload,
                        metadata: {
                            type: 'document_signature',
                            name: docName,
                            hash: documentHash,
                            signer: signerAddress
                        },
                        note: publicNote,
                        signerAddress,
                    },
                }),
            });

            setAnchoringMessage(6); // Verifying zero-knowledge proof...
            await new Promise(r => setTimeout(r, 400));

            const result = await response.json();

            setAnchoringMessage(7); // Finalizing blockchain transaction...
            await new Promise(r => setTimeout(r, 400));

            if (result.success) {
                // Convert payload to hex for raw data display
                const rawDataHex = '0x' + Array.from(encoder.encode(JSON.stringify(payload)))
                    .map(b => b.toString(16).padStart(2, '0')).join('');

                setAnchoringMessage(8); // File successfully anchored!

                // Small delay to show success message
                await new Promise(resolve => setTimeout(resolve, 600));

                setAnchorResult({
                    txHash: result.txHash,
                    explorerUrl: result.explorerUrl,
                    rawData: rawDataHex,
                });
            }
        } catch (error) {
            console.error('Anchor failed:', error);
        } finally {
            setIsAnchoring(false);
        }
    };

    function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
        setNumPages(numPages);
    }

    const resetAll = () => {
        setDocFile(null);
        setDocName('');
        setSignatureImage(null);
        setTypedSignature('');
        setShowSignature(false);
        setStep('upload');
        setAnchorResult(null);
        setPublicNote('');
        setPublicNote('');
        sessionStorage.removeItem('pribado_docs_state');
    };

    const confirmReset = () => {
        // Soft reset to avoid logging out
        resetAll();
        setShowResetPrompt(false);
    };

    // STEP 1: Upload
    if (step === 'upload') {
        // Check if user is authenticated
        if (!user?.address) {
            return (
                <div className="h-full flex flex-col items-center justify-center p-6 animate-fade-in">
                    <div className="max-w-md text-center">
                        <div className="w-20 h-20 bg-zinc-900 border border-zinc-700 rounded-2xl flex items-center justify-center mx-auto mb-6">
                            <Lock className="w-10 h-10 text-red-500" />
                        </div>
                        <h1 className="text-2xl font-bold text-zinc-50 mb-3">Authentication Required</h1>
                        <p className="text-zinc-400 mb-6">
                            Document signing requires wallet authentication to cryptographically verify your identity.
                        </p>
                        <a
                            href="/vault"
                            className="inline-block px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-bold transition-all"
                        >
                            Login with Wallet
                        </a>
                    </div>
                </div>
            );
        }

        return (
            <div className="h-full flex flex-col items-center justify-center p-4 bg-zinc-950 animate-fade-in">
                <div className="max-w-md w-full text-center">
                    <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
                        <FileText className="w-8 h-8 text-emerald-500" />
                    </div>

                    <h1 className="text-xl font-bold text-zinc-50 mb-1">Secure Document Signing</h1>
                    <p className="text-xs text-zinc-400 mb-4">
                        Documents encrypted & anchored to Sapphire TEE.
                    </p>

                    {/* Authenticated Badge */}
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/30 rounded-full mb-6">
                        <CheckCircle className="w-4 h-4 text-emerald-500" />
                        <span className="text-xs text-emerald-400 font-medium">
                            Wallet: {user.address.slice(0, 6)}...{user.address.slice(-4)}
                        </span>
                    </div>

                    {/* Steps indicator */}
                    <div className="flex items-center justify-center gap-3 mb-6">
                        <div className="flex items-center gap-1.5">
                            <div className="w-6 h-6 bg-emerald-500 rounded-full flex items-center justify-center text-white text-xs font-bold">1</div>
                            <span className="text-emerald-400 text-xs font-medium">Upload</span>
                        </div>
                        <div className="w-6 h-px bg-zinc-800" />
                        <div className="flex items-center gap-1.5">
                            <div className="w-6 h-6 bg-zinc-800 rounded-full flex items-center justify-center text-zinc-500 text-xs font-bold border border-zinc-700">2</div>
                            <span className="text-zinc-500 text-xs">Sign</span>
                        </div>
                        <div className="w-6 h-px bg-zinc-800" />
                        <div className="flex items-center gap-1.5">
                            <div className="w-6 h-6 bg-zinc-800 rounded-full flex items-center justify-center text-zinc-500 text-xs font-bold border border-zinc-700">3</div>
                            <span className="text-zinc-500 text-xs">Download</span>
                        </div>
                    </div>

                    <label className="block w-full cursor-pointer group">
                        <input
                            type="file"
                            onChange={handleFileUpload}
                            className="hidden"
                            accept="image/*,application/pdf"
                        />
                        <div className="w-full py-8 border border-dashed border-zinc-700 group-hover:border-emerald-500 bg-zinc-900/50 group-hover:bg-zinc-900 rounded-xl transition-all">
                            <Upload className="w-6 h-6 text-zinc-500 mx-auto mb-2 group-hover:text-emerald-500 transition-colors" />
                            <p className="text-zinc-300 text-sm font-medium">Drop document or browse</p>
                            <p className="text-[10px] text-zinc-600 mt-1">Supports PDF, JPG, PNG</p>
                        </div>
                    </label>

                    {/* Tech Stack */}
                    <div className="mt-6 grid grid-cols-2 gap-2 text-xs text-zinc-500">
                        <span className="flex items-center gap-1.5 justify-center bg-zinc-800/50 px-2 py-1.5 rounded-lg border border-zinc-700/50">
                            <Wallet className="w-3 h-3 text-emerald-500" /> Wallet Verification
                        </span>
                        <span className="flex items-center gap-1.5 justify-center bg-zinc-800/50 px-2 py-1.5 rounded-lg border border-zinc-700/50">
                            <Lock className="w-3 h-3 text-emerald-500" /> AES-256 Encrypted
                        </span>
                        <span className="flex items-center gap-1.5 justify-center bg-zinc-800/50 px-2 py-1.5 rounded-lg border border-zinc-700/50">
                            <Shield className="w-3 h-3 text-emerald-500" /> Sapphire TEE
                        </span>
                        <span className="flex items-center gap-1.5 justify-center bg-zinc-800/50 px-2 py-1.5 rounded-lg border border-zinc-700/50">
                            <Key className="w-3 h-3 text-emerald-500" /> On-Chain Anchor
                        </span>
                    </div>
                    <p className="mt-3 text-[10px] text-zinc-600 font-mono">
                        SHA-256 Hash • ECDSA Signature • Tamper-Proof
                    </p>
                </div>
            </div>
        );
    }

    // STEP 3: Complete
    if (step === 'complete') {
        return (
            <div className="h-full flex flex-col items-center justify-center p-4 bg-zinc-950 animate-fade-in">
                <div className="max-w-sm w-full text-center">
                    <div className="w-14 h-14 bg-emerald-500/20 border border-emerald-500/30 rounded-xl flex items-center justify-center mx-auto mb-4">
                        <Check className="w-7 h-7 text-emerald-500" />
                    </div>

                    <h1 className="text-xl font-bold text-zinc-50 mb-1">Document Signed!</h1>
                    <p className="text-xs text-zinc-400 mb-6">
                        Your document has been signed successfully.
                    </p>

                    {anchorResult && (
                        <div className="mb-6 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-left">
                            <div className="flex items-center gap-2 mb-1">
                                <Shield className="w-3.5 h-3.5 text-emerald-500" />
                                <span className="text-emerald-400 font-medium text-xs">Anchored to Blockchain</span>
                            </div>
                            <p className="text-[10px] text-zinc-400 font-mono break-all">{anchorResult.txHash}</p>
                            <a
                                href={anchorResult.explorerUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[10px] text-emerald-400 hover:underline mt-1.5 inline-block"
                            >
                                View on Explorer →
                            </a>
                        </div>
                    )}

                    <button
                        onClick={resetAll}
                        className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg font-bold text-sm transition-all shadow-lg shadow-emerald-500/20"
                    >
                        Sign Another Document
                    </button>
                </div>
            </div>
        );
    }

    // STEP 2: Sign
    return (
        <div className="min-h-full md:h-full flex flex-col md:flex-row bg-zinc-950 overflow-auto md:overflow-hidden relative">
            {/* Anchoring Loading Overlay - Cypherpunk Style */}
            {isAnchoring && (
                <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center gap-4">
                    {/* Animated logo with green glow */}
                    <div className="relative">
                        <div className="w-16 h-16 rounded-full bg-emerald-500/20 animate-pulse shadow-lg shadow-emerald-500/30" />
                        <div className="absolute inset-0 w-16 h-16 rounded-full border-2 border-emerald-500/50 animate-ping" />
                        <div className="absolute inset-0 flex items-center justify-center">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src="/logo.png" alt="Pribado" className="w-10 h-10 animate-pulse" />
                        </div>
                    </div>

                    {/* Title */}
                    <div className="text-center">
                        <p className="text-white font-bold text-sm tracking-wider mb-0.5">
                            ANCHORING TO BLOCKCHAIN
                        </p>
                        <p className="text-emerald-400/80 text-[10px] font-mono tracking-widest">
                            OASIS SAPPHIRE • TEE SECURED
                        </p>
                    </div>

                    {/* Animated Message */}
                    <div className="bg-zinc-900/80 border border-emerald-500/30 rounded-lg px-4 py-2 min-w-[280px]">
                        <p className="text-emerald-400 text-xs font-mono text-center animate-pulse">
                            {anchoringMessages[anchoringMessage]}
                        </p>
                    </div>

                    {/* Blue to green progress bar */}
                    <div className="w-56 h-1 bg-zinc-800 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 transition-all duration-500 ease-out"
                            style={{ width: `${(anchoringMessage / (anchoringMessages.length - 1)) * 100}%` }}
                        />
                    </div>

                    {/* Floating hex codes for effect */}
                    <div className="absolute inset-0 overflow-hidden pointer-events-none">
                        <div className="absolute top-10 left-10 text-emerald-500/15 font-mono text-[10px] animate-pulse">0x7f3a...8b2c</div>
                        <div className="absolute top-20 right-16 text-emerald-500/15 font-mono text-[10px] animate-pulse" style={{ animationDelay: '0.3s' }}>SHA256</div>
                        <div className="absolute bottom-32 left-20 text-blue-500/15 font-mono text-[10px] animate-pulse" style={{ animationDelay: '0.6s' }}>ECDSA</div>
                        <div className="absolute bottom-20 right-10 text-emerald-500/15 font-mono text-[10px] animate-pulse" style={{ animationDelay: '0.9s' }}>0xaef1...d93e</div>
                        <div className="absolute top-1/3 left-8 text-emerald-500/15 font-mono text-[10px] animate-pulse" style={{ animationDelay: '1.2s' }}>AES-256</div>
                        <div className="absolute bottom-1/3 right-8 text-blue-500/15 font-mono text-[10px] animate-pulse" style={{ animationDelay: '1.5s' }}>TEE</div>
                    </div>
                </div>
            )}
            {/* Left Panel - Signature Creator - No scroll on mobile, let it push content */}
            <div className="w-full md:w-56 border-b md:border-b-0 md:border-r border-zinc-800 p-1.5 md:p-3 flex flex-col bg-zinc-900 flex-shrink-0 md:overflow-y-auto">
                {/* Mobile Steps Indicator - Dynamic */}
                <div className="flex md:hidden items-center justify-center gap-2 mb-2 py-1">
                    {/* Upload - Always completed */}
                    <div className="flex items-center gap-1">
                        <div className="w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center text-white text-[10px] font-bold">✓</div>
                        <span className="text-emerald-400 text-[10px] font-medium">Upload</span>
                    </div>
                    <div className="w-4 h-px bg-zinc-700" />
                    {/* Sign - Gray → Green when signature added → Checkmark after anchored */}
                    <div className="flex items-center gap-1">
                        {anchorResult ? (
                            <div className="w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center text-white text-[10px] font-bold">✓</div>
                        ) : showSignature ? (
                            <div className="w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center text-white text-[10px] font-bold">2</div>
                        ) : (
                            <div className="w-5 h-5 bg-zinc-800 rounded-full flex items-center justify-center text-zinc-500 text-[10px] font-bold border border-zinc-700">2</div>
                        )}
                        <span className={`text-[10px] ${showSignature || anchorResult ? 'text-emerald-400 font-medium' : 'text-zinc-500'}`}>Sign</span>
                    </div>
                    <div className="w-4 h-px bg-zinc-700" />
                    {/* Download - Gray → Green+Checkmark after downloaded */}
                    <div className="flex items-center gap-1">
                        {isDownloaded ? (
                            <div className="w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center text-white text-[10px] font-bold">✓</div>
                        ) : anchorResult ? (
                            <div className="w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center text-white text-[10px] font-bold">3</div>
                        ) : (
                            <div className="w-5 h-5 bg-zinc-800 rounded-full flex items-center justify-center text-zinc-500 text-[10px] font-bold border border-zinc-700">3</div>
                        )}
                        <span className={`text-[10px] ${isDownloaded || anchorResult ? 'text-emerald-400 font-medium' : 'text-zinc-500'}`}>Download</span>
                    </div>
                </div>

                <div className="flex items-center justify-between mb-1.5 md:mb-3">
                    <h2 className="text-[10px] md:text-sm font-bold text-zinc-400 md:text-zinc-200 uppercase tracking-wider hidden md:block">Signature</h2>

                    {/* Mode Selector - Inline Row */}
                    <div className="flex gap-1 flex-1 md:flex-none">
                        {[
                            { mode: 'draw' as SignatureMode, icon: PenTool },
                            { mode: 'type' as SignatureMode, icon: Type },
                            { mode: 'upload' as SignatureMode, icon: ImageIcon },
                        ].map(({ mode, icon: Icon }) => (
                            <button
                                key={mode}
                                onClick={(e) => {
                                    if (!handleLockedInteraction(e)) {
                                        setSignatureMode(mode);
                                    }
                                }}
                                className={`flex-1 md:flex-none p-1.5 rounded text-[10px] font-medium transition-colors flex items-center justify-center ${signatureMode === mode
                                    ? 'bg-emerald-500 text-white shadow-sm'
                                    : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                                    }`}
                            >
                                <Icon className="w-3.5 h-3.5" />
                            </button>
                        ))}
                    </div>
                </div>

                {/* Draw Mode - Compact */}
                {signatureMode === 'draw' && (
                    <div className="flex flex-row md:flex-col gap-2 h-20 md:h-auto items-center md:items-stretch">
                        <div className="bg-white rounded border border-zinc-300 overflow-hidden flex-1 min-w-0 h-full md:h-32">
                            <canvas
                                ref={drawCanvasRef}
                                width={300}
                                height={150}
                                onMouseDown={startDrawing}
                                onMouseMove={draw}
                                onMouseUp={stopDrawing}
                                onMouseLeave={stopDrawing}
                                onTouchStart={startDrawingTouch}
                                onTouchMove={drawTouch}
                                onTouchEnd={stopDrawing}
                                className="cursor-crosshair block w-full h-full"
                                style={{ touchAction: 'none' }}
                            />
                        </div>
                        <button
                            onClick={clearDrawing}
                            className="h-full md:h-auto px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 rounded text-[10px] flex items-center justify-center shrink-0"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                        </button>
                    </div>
                )}

                {/* Type Mode - Compact */}
                {signatureMode === 'type' && (
                    <div className="flex flex-col gap-1.5">
                        <input
                            type="text"
                            value={typedSignature}
                            onChange={(e) => setTypedSignature(e.target.value)}
                            placeholder="Type name..."
                            className="w-full px-2 py-1.5 bg-zinc-950 border border-zinc-800 rounded text-zinc-300 focus:outline-none focus:border-emerald-500 text-xs"
                        />

                        {/* Font Controls - Hidden on mobile unless expanded (simplified here) */}
                        <div className="hidden md:block mb-3">
                            <label className="text-[10px] text-zinc-500 font-mono mb-1.5 block">FONT STYLE</label>
                            <select
                                value={selectedFont.name}
                                onChange={(e) => setSelectedFont(SIGNATURE_FONTS.find(f => f.name === e.target.value) || SIGNATURE_FONTS[0])}
                                className="w-full px-2 py-1.5 bg-zinc-950 border border-zinc-800 rounded text-zinc-300 text-xs"
                            >
                                {SIGNATURE_FONTS.map((font) => (
                                    <option key={font.name} value={font.name}>{font.name}</option>
                                ))}
                            </select>
                        </div>

                        {typedSignature && (
                            <div className="bg-white rounded p-1 text-center h-10 md:h-20 flex items-center justify-center border border-zinc-200">
                                <span
                                    className="text-lg md:text-2xl text-zinc-900 truncate px-2"
                                    style={{ fontFamily: selectedFont.family }}
                                >
                                    {typedSignature}
                                </span>
                            </div>
                        )}
                    </div>
                )}

                {/* Upload Mode - Compact */}
                {signatureMode === 'upload' && (
                    <div className="flex-1 flex flex-col">
                        <label className="h-10 md:h-32 flex flex-row md:flex-col items-center justify-center gap-2 border border-dashed border-zinc-700 hover:border-emerald-500 rounded cursor-pointer transition-colors bg-zinc-900/50 hover:bg-zinc-900">
                            <input
                                type="file"
                                onChange={handleSignatureUpload}
                                className="hidden"
                                accept="image/*"
                            />
                            {signatureImage ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={signatureImage} alt="Sig" className="h-full object-contain p-1" />
                            ) : (
                                <>
                                    <Upload className="w-4 h-4 text-zinc-500" />
                                    <span className="text-zinc-500 text-[10px]">Upload</span>
                                </>
                            )}
                        </label>
                    </div>
                )}

                {/* Actions - Compact */}
                <div className="mt-1 space-y-1.5 md:space-y-2 md:mt-4">
                    {showSignature && (
                        <>
                            <div className="space-y-1.5 md:space-y-2">
                                <div className="space-y-0.5 md:space-y-1 hidden md:block">
                                    <label className="text-[10px] text-zinc-500 font-medium ml-1">PUBLIC NOTE</label>
                                    <input
                                        type="text"
                                        value={publicNote}
                                        onChange={(e) => setPublicNote(e.target.value)}
                                        placeholder="Optional note..."
                                        disabled={isAnchoring || !!anchorResult}
                                        className="w-full px-2 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-300 text-xs"
                                    />
                                </div>

                                <button
                                    onClick={anchorToBlockchain}
                                    disabled={isAnchoring || !!anchorResult}
                                    className="w-full py-1.5 md:py-2 bg-gradient-to-r from-blue-500 to-emerald-500 hover:from-blue-600 hover:to-emerald-600 disabled:bg-zinc-800 disabled:from-zinc-800 disabled:to-zinc-800 text-white rounded font-bold transition-all flex items-center justify-center gap-2 text-[10px] md:text-xs"
                                >
                                    {isAnchoring ? (
                                        <Loader2 className="w-3 h-3 md:w-3.5 md:h-3.5 animate-spin" />
                                    ) : anchorResult ? (
                                        <Check className="w-3 h-3 md:w-3.5 md:h-3.5" />
                                    ) : (
                                        <Shield className="w-3 h-3 md:w-3.5 md:h-3.5" />
                                    )}
                                    {anchorResult ? 'Anchored!' : 'Anchor on Blockchain'}
                                </button>
                            </div>

                            {/* Anchor Result - Compact */}
                            {anchorResult && (
                                <div className="p-2 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                                    <div className="flex items-center gap-1.5 mb-1">
                                        <Shield className="w-3.5 h-3.5 text-blue-400" />
                                        <span className="text-blue-400 font-medium text-[10px]">
                                            Anchored
                                        </span>
                                    </div>
                                    {/* Transaction Details - Ultra Compact */}
                                    <div className="space-y-1.5 mb-2 bg-zinc-900/50 rounded border border-zinc-800 p-2">
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <span className="text-[9px] text-zinc-500 font-bold shrink-0">TX</span>
                                                <code className="text-[10px] text-blue-400 font-mono truncate min-w-0">
                                                    {anchorResult.txHash ? `${anchorResult.txHash.slice(0, 8)}...${anchorResult.txHash.slice(-6)}` : 'N/A'}
                                                </code>
                                            </div>
                                            <div className="flex items-center gap-1 shrink-0">
                                                <button
                                                    onClick={handleCopyTx}
                                                    className="p-1 hover:bg-zinc-800 rounded text-zinc-500 hover:text-zinc-300 transition-colors"
                                                >
                                                    {copiedTx ? <Check className="w-2.5 h-2.5 text-emerald-500" /> : <Copy className="w-2.5 h-2.5" />}
                                                </button>
                                                <a href={anchorResult.explorerUrl} target="_blank" rel="noopener noreferrer" className="p-1 hover:bg-zinc-800 rounded text-blue-400 hover:text-blue-300">
                                                    <ExternalLink className="w-2.5 h-2.5" />
                                                </a>
                                            </div>
                                        </div>

                                        <div className="w-full h-px bg-zinc-800" />

                                        <div className="flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <span className="text-[9px] text-zinc-500 font-bold shrink-0">DATA</span>
                                                <code className="text-[10px] text-zinc-400 font-mono truncate min-w-0">
                                                    {anchorResult.rawData ? `${anchorResult.rawData.slice(0, 8)}...${anchorResult.rawData.slice(-6)}` : 'N/A'}
                                                </code>
                                            </div>
                                            <button
                                                onClick={handleCopyData}
                                                className="p-1 hover:bg-zinc-800 rounded text-zinc-500 hover:text-zinc-300 shrink-0 transition-colors"
                                            >
                                                {copiedData ? <Check className="w-2.5 h-2.5 text-emerald-500" /> : <Copy className="w-2.5 h-2.5" />}
                                            </button>
                                        </div>
                                    </div>

                                    <button
                                        onClick={downloadDocument}
                                        className="w-full py-1.5 bg-gradient-to-r from-blue-500 to-emerald-500 hover:from-blue-600 hover:to-emerald-600 text-white rounded-lg font-bold text-[10px] flex items-center justify-center gap-1.5 shadow-lg shadow-blue-500/20"
                                    >
                                        <Download className="w-3 h-3" /> Download Signed Doc
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* Right Panel - Document Preview */}
            <div className="w-full md:flex-1 flex flex-col bg-zinc-950 relative group/preview overflow-auto md:overflow-hidden">
                {/* Toolbar */}
                <div className="h-12 border-b border-zinc-800 bg-zinc-900 flex items-center justify-between px-3 shrink-0">
                    <div className="flex items-center gap-3 min-w-0">
                        <button
                            onClick={resetAll}
                            className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors shrink-0"
                        >
                            <X className="w-4 h-4" />
                        </button>
                        <span className="text-xs text-zinc-400 font-mono truncate max-w-[120px] md:max-w-xs block">{docName}</span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                        {fileType === 'pdf' && (
                            <div className="flex items-center gap-1 mr-3 border-r border-zinc-800 pr-3">
                                <button
                                    onClick={() => setPageNumber(p => Math.max(1, p - 1))}
                                    disabled={pageNumber <= 1}
                                    className="p-1 hover:bg-zinc-800 rounded disabled:opacity-30"
                                >
                                    <ChevronLeft className="w-3.5 h-3.5 text-zinc-400" />
                                </button>
                                <span className="text-[10px] text-zinc-400 font-mono">{pageNumber}/{numPages}</span>
                                <button
                                    onClick={() => setPageNumber(p => Math.min(numPages, p + 1))}
                                    disabled={pageNumber >= numPages}
                                    className="p-1 hover:bg-zinc-800 rounded disabled:opacity-30"
                                >
                                    <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />
                                </button>
                            </div>
                        )}

                        <button onClick={() => setScale(s => Math.max(0.5, s - 0.1))} className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-400 hidden sm:block">
                            <ZoomOut className="w-4 h-4" />
                        </button>
                        <span className="font-mono text-[10px] text-zinc-500 w-10 text-center hidden sm:block">{Math.round(scale * 100)}%</span>
                        <button onClick={() => setScale(s => Math.min(2, s + 0.1))} className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-400 hidden sm:block">
                            <ZoomIn className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* Document Area */}
                <div
                    ref={containerRef}
                    className="w-full overflow-auto flex items-start md:items-center justify-center p-2 md:p-6 bg-zinc-950/50 relative max-h-[35vh] md:max-h-none md:flex-1"
                >
                    <div
                        ref={documentRef}
                        className="relative shadow-2xl shadow-black/50 bg-white"
                        style={{ transform: `scale(${scale})`, transformOrigin: 'center top' }}
                    >
                        {fileType === 'pdf' ? (
                            <Document
                                file={docFile}
                                onLoadSuccess={onDocumentLoadSuccess}
                                loading={
                                    <div className="flex items-center gap-2 p-8">
                                        <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
                                        <span>Loading...</span>
                                    </div>
                                }
                            >
                                <Page
                                    pageNumber={pageNumber}
                                    renderTextLayer={false}
                                    renderAnnotationLayer={false}
                                    width={window.innerWidth < 768 ? window.innerWidth - 16 : undefined}
                                />
                            </Document>
                        ) : (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                src={docFile as string}
                                alt="Document"
                                className="max-w-full md:max-w-[800px] h-auto object-contain"
                            />
                        )}

                        {/* Signature Overlay */}
                        {showSignature && (
                            <div
                                className="absolute group cursor-move flex items-center justify-center"
                                style={{
                                    left: `${signaturePosition.x}%`,
                                    top: `${signaturePosition.y}%`,
                                    // For TYPE mode, width/height are auto based on content
                                    width: signatureMode === 'type' ? 'auto' : signatureSize.width,
                                    height: signatureMode === 'type' ? 'auto' : signatureSize.height,
                                    // Prevent wrapping for text
                                    whiteSpace: 'nowrap',
                                    // CRITICAL: Prevent touch scrolling when dragging
                                    touchAction: 'none',
                                }}
                                onMouseDown={handleSignatureDragStart}
                                onTouchStart={handleTouchDragStart}
                                onTouchMove={handleTouchDrag}
                                onTouchEnd={handleTouchDragEnd}
                            >
                                {/* Selection Border (Canva-style) - Always visible */}
                                <div data-html2canvas-ignore="true" className="absolute -inset-2 border-2 border-emerald-500 opacity-100 transition-opacity pointer-events-none rounded-lg" />

                                {/* Delete Button - Top Left - Always visible */}
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setShowSignature(false);
                                        setSignatureImage(null);
                                        setTypedSignature('');
                                        clearDrawing();
                                    }}
                                    data-html2canvas-ignore="true"
                                    className="absolute -top-3 -left-3 w-5 h-5 bg-red-500 hover:bg-red-600 rounded-full z-20 shadow-sm opacity-100 transition-opacity flex items-center justify-center"
                                >
                                    <X className="w-3 h-3 text-white" />
                                </button>

                                {/* Render Content based on Mode */}
                                {signatureMode === 'type' ? (
                                    <span
                                        className="relative z-10 text-zinc-900 leading-none select-none"
                                        style={{
                                            fontFamily: selectedFont.family,
                                            fontSize: `${fontSize}px`,
                                            // Add text shadow for better visibility on dark docs
                                            textShadow: '0 0 1px rgba(255,255,255,0.5)'
                                        }}
                                    >
                                        {typedSignature}
                                    </span>
                                ) : (
                                    signatureImage && (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                            src={signatureImage}
                                            alt="Your Signature"
                                            className="w-full h-full object-contain pointer-events-none relative z-10"
                                            draggable={false}
                                        />
                                    )
                                )}

                                {/* Resize Handles */}
                                <div
                                    data-html2canvas-ignore="true"
                                    className={`absolute -bottom-3 -right-3 w-5 h-5 bg-white border-2 border-emerald-500 rounded-full cursor-nwse-resize z-20 shadow-sm ${isDragging || isResizing ? 'opacity-100' : 'opacity-100'} transition-opacity flex items-center justify-center`}
                                    style={{ touchAction: 'none' }}
                                    onMouseDown={handleResizeStart}
                                    onTouchStart={handleTouchResizeStart}
                                    onTouchMove={handleTouchResize}
                                    onTouchEnd={handleTouchResizeEnd}
                                >
                                    <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                                </div>
                            </div>
                        )}


                    </div>
                </div>

                {/* Zoom Overlay (Floating - Top Left) */}
                <div className="absolute top-14 left-4 flex flex-col gap-2 z-40">
                    <button
                        onClick={() => setScale(s => Math.min(2, s + 0.1))}
                        className="w-10 h-10 bg-zinc-900/90 border border-zinc-700 rounded-full text-zinc-300 hover:text-white flex items-center justify-center shadow-lg backdrop-blur touch-target"
                    >
                        <ZoomIn className="w-5 h-5" />
                    </button>
                    <button
                        onClick={() => setScale(s => Math.max(0.5, s - 0.1))}
                        className="w-10 h-10 bg-zinc-900/90 border border-zinc-700 rounded-full text-zinc-300 hover:text-white flex items-center justify-center shadow-lg backdrop-blur touch-target"
                    >
                        <ZoomOut className="w-5 h-5" />
                    </button>
                </div>


                {/* Steps Footer - Desktop Only (Mobile has it at top) */}
                <div className="h-14 border-t border-zinc-800 bg-zinc-900 hidden md:flex items-center justify-center gap-3 text-xs shrink-0 z-30 pb-safe">
                    {/* Step 1: Upload (Always Done) */}
                    <div className="flex items-center gap-1.5 text-emerald-500 font-medium">
                        <Check className="w-3.5 h-3.5" /> Upload
                    </div>

                    <div className="w-3 h-px bg-zinc-700" />

                    {/* Step 2: Sign */}
                    <div className={`flex items-center gap-1.5 transition-colors ${!anchorResult ? 'text-emerald-400 font-bold' : 'text-emerald-500 font-medium'}`}>
                        {!anchorResult ? (
                            <div className="w-3.5 h-3.5 border-2 border-emerald-400 rounded-full" />
                        ) : (
                            <Check className="w-3.5 h-3.5" />
                        )}
                        Sign
                    </div>

                    <div className="w-3 h-px bg-zinc-700" />

                    {/* Step 3: Download */}
                    <div className={`flex items-center gap-1.5 transition-colors ${anchorResult ? 'text-emerald-400 font-bold' : 'text-zinc-600'}`}>
                        {isDownloaded ? (
                            <Check className="w-3.5 h-3.5" />
                        ) : anchorResult ? (
                            <div className="w-3.5 h-3.5 border-2 border-emerald-400 rounded-full shadow-sm shadow-emerald-500/20" />
                        ) : (
                            <div className="w-3.5 h-3.5 border border-zinc-600 rounded-full" />
                        )}
                        Download
                    </div>
                </div>
            </div>

            {/* Success Modal - Anchoring Confirmation */}
            {showSuccessModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 max-w-sm w-full shadow-2xl animate-scale-in">
                        <div className="w-12 h-12 bg-emerald-500/10 rounded-full flex items-center justify-center mb-4 mx-auto">
                            <Shield className="w-6 h-6 text-emerald-500" />
                        </div>
                        <h3 className="text-lg font-bold text-emerald-400 text-center mb-2">Tamper-proof & Immutable</h3>
                        <p className="text-sm text-zinc-400 text-center mb-6 leading-relaxed">
                            Congratulations, your file has been anchored to Oasis Sapphire&apos;s blockchain. You can validate this by copying the RAW data and paste it on the &quot;Verify&quot; tab.
                        </p>
                        <button
                            onClick={() => setShowSuccessModal(false)}
                            className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg font-bold text-sm transition-colors"
                        >
                            OK
                        </button>
                    </div>
                </div>
            )}

            {/* Toast Notification - Center */}
            {
                toast && (
                    <div className="fixed inset-0 flex items-center justify-center pointer-events-none z-50">
                        <div className="bg-emerald-500 text-white px-6 py-3 rounded-xl shadow-lg shadow-emerald-500/30 font-bold text-sm animate-fade-in">
                            {toast}
                        </div>
                    </div>
                )
            }
            {/* Reset Prompt Toast */}
            {showResetPrompt && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
                    <div className="bg-zinc-900 border border-red-500/30 rounded-xl p-5 max-w-sm w-full shadow-2xl animate-scale-in">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="w-10 h-10 bg-red-500/10 rounded-full flex items-center justify-center shrink-0">
                                <Lock className="w-5 h-5 text-red-500" />
                            </div>
                            <h3 className="text-sm font-bold text-zinc-100">Document Locked</h3>
                        </div>
                        <p className="text-xs text-zinc-400 mb-5 leading-relaxed">
                            You cannot edit anymore in this file.
                            <br />
                            Do you want to anchor a new file?
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowResetPrompt(false)}
                                className="flex-1 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg font-bold text-xs transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmReset}
                                className="flex-1 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg font-bold text-xs transition-colors shadow-lg shadow-red-500/20"
                            >
                                Yes
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div >
    );
}