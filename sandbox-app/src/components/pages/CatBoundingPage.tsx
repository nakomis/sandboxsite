import React, { useEffect, useRef, useState } from 'react';
import { Credentials } from '@aws-sdk/client-cognito-identity';
import Config from '../../config/config';
import { BoundingBox, BoundingPoint, CatadataRecord } from '../../dto/CatadataRecord';
import {
    BOUNDABLE_CATS,
    CatBoundingStats,
    claimNextUnbounded,
    getBoundingImage,
    getBoundingStats,
    saveBoundingData,
    unlabelRecord,
} from '../../services/BoundingService';

import bootsImg  from '../../images/boots.png';
import chiImg    from '../../images/chi.png';
import kappaImg  from '../../images/kappa.png';
import muImg     from '../../images/mu.png';
import tauImg    from '../../images/tau.png';

const CAT_IMAGES: Record<string, string> = {
    Boots: bootsImg,
    Chi:   chiImg,
    Kappa: kappaImg,
    Mu:    muImg,
    Tau:   tauImg,
    NoCat: '',
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TapMode = 'positive' | 'negative';
type View = 'overview' | 'annotating';

interface Props {
    tabId: number;
    index: number;
    creds: Credentials | null;
    username: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

async function callSamServer(
    imageBlob: Blob,
    points: BoundingPoint[],
    displayWidth: number,
    displayHeight: number
): Promise<{ overlay: string; bounding_box: BoundingBox }> {
    const base64 = await blobToBase64(imageBlob);
    const response = await fetch(`${Config.sam.serverUrl}/segment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            image: base64,
            points,
            display_width: displayWidth,
            display_height: displayHeight,
        }),
    });
    if (!response.ok) throw new Error(`SAM server error: ${response.status}`);
    return response.json();
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatCard({
    cat,
    stats,
    onClick,
}: {
    cat: string;
    stats: CatBoundingStats;
    onClick: () => void;
}) {
    const img = CAT_IMAGES[cat];
    return (
        <div
            onClick={onClick}
            style={{
                cursor: 'pointer',
                background: '#2a2a2a',
                border: '2px solid #444',
                borderRadius: 12,
                padding: 16,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 8,
                minWidth: 140,
                userSelect: 'none',
            }}
        >
            {img ? (
                <img src={img} alt={cat} style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8 }} />
            ) : (
                <div style={{ width: 80, height: 80, borderRadius: 8, background: '#444', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32 }}>🚫</div>
            )}
            <span style={{ fontWeight: 'bold', fontSize: 18, color: '#eee' }}>{cat}</span>
            <span style={{ fontSize: 14, color: '#aaa' }}>{stats.sorted} sorted</span>
            <span style={{ fontSize: 14, color: stats.bounded > 0 ? '#6c6' : '#aaa' }}>
                {stats.bounded} bounded
            </span>
            {stats.sorted > 0 && (
                <div style={{ width: '100%', height: 6, background: '#444', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${Math.round((stats.bounded / stats.sorted) * 100)}%`, height: '100%', background: '#6c6' }} />
                </div>
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function CatBoundingPage({ tabId, index, creds, username }: Props) {
    const [view, setView] = useState<View>('overview');
    const [stats, setStats] = useState<Record<string, CatBoundingStats>>({});
    const [statsLoading, setStatsLoading] = useState(false);

    // Annotation state
    const [selectedCat, setSelectedCat] = useState<string | null>(null);
    const [currentRecord, setCurrentRecord] = useState<CatadataRecord | null>(null);
    const [imageBlob, setImageBlob] = useState<Blob | null>(null);
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [canvasSize, setCanvasSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
    const [points, setPoints] = useState<BoundingPoint[]>([]);
    const [tapMode, setTapMode] = useState<TapMode>('positive');
    const [samOverlay, setSamOverlay] = useState<string | null>(null);
    const [boundingBox, setBoundingBox] = useState<BoundingBox | null>(null);
    const [samLoading, setSamLoading] = useState(false);
    const [samError, setSamError] = useState<string | null>(null);
    const [recordLoading, setRecordLoading] = useState(false);
    const [recordError, setRecordError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const imageRef = useRef<HTMLImageElement>(null);

    const isActive = tabId === index;

    // ---------------------------------------------------------------------------
    // Load stats when tab becomes active
    // ---------------------------------------------------------------------------

    useEffect(() => {
        if (!isActive || !creds) return;
        setStatsLoading(true);
        getBoundingStats(creds)
            .then(setStats)
            .catch(console.error)
            .finally(() => setStatsLoading(false));
    }, [isActive, creds]);

    // ---------------------------------------------------------------------------
    // Canvas: redraw when overlay or points change
    // ---------------------------------------------------------------------------

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || canvasSize.w === 0) return;
        const ctx = canvas.getContext('2d')!;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const drawPoints = () => {
            points.forEach(p => {
                ctx.beginPath();
                ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
                ctx.fillStyle = p.label === 1 ? 'rgba(80,200,80,0.9)' : 'rgba(220,60,60,0.9)';
                ctx.fill();
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 2;
                ctx.stroke();
            });
        };

        if (samOverlay) {
            const img = new window.Image();
            img.onload = () => {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                drawPoints();
            };
            img.src = `data:image/png;base64,${samOverlay}`;
        } else {
            drawPoints();
        }
    }, [samOverlay, points, canvasSize]);

    // ---------------------------------------------------------------------------
    // Navigation
    // ---------------------------------------------------------------------------

    const enterAnnotating = async (cat: string) => {
        setSelectedCat(cat);
        setView('annotating');
        await loadNextRecord(cat);
    };

    const loadNextRecord = async (cat: string) => {
        if (!creds || !username) {
            setRecordError(!creds ? 'No AWS credentials — try refreshing the page.' : 'No username found in your session profile.');
            return;
        }
        setRecordLoading(true);
        setRecordError(null);
        clearAnnotation();
        try {
            const record = await claimNextUnbounded(creds, cat, username);
            if (!record) {
                setCurrentRecord(null);
                return;
            }
            setCurrentRecord(record);
            const blob = await getBoundingImage(creds, record);
            const url = URL.createObjectURL(blob);
            setImageBlob(blob);
            setImageUrl(url);
        } catch (err: any) {
            console.error('Failed to load record:', err);
            setRecordError(err?.message ?? String(err));
        } finally {
            setRecordLoading(false);
        }
    };

    const clearAnnotation = () => {
        setPoints([]);
        setSamOverlay(null);
        setBoundingBox(null);
        setSamError(null);
        if (imageUrl) URL.revokeObjectURL(imageUrl);
        setImageUrl(null);
        setImageBlob(null);
    };

    // ---------------------------------------------------------------------------
    // Image load — sync canvas size to displayed image size
    // ---------------------------------------------------------------------------

    const onImageLoad = () => {
        if (!imageRef.current) return;
        setCanvasSize({ w: imageRef.current.clientWidth, h: imageRef.current.clientHeight });
    };

    // ---------------------------------------------------------------------------
    // Tap handler
    // ---------------------------------------------------------------------------

    const onCanvasPointerDown = async (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (!imageBlob || !canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const newPoint: BoundingPoint = { x, y, label: tapMode === 'positive' ? 1 : 0 };
        const newPoints = [...points, newPoint];
        setPoints(newPoints);

        setSamLoading(true);
        setSamError(null);
        try {
            const result = await callSamServer(imageBlob, newPoints, canvasSize.w, canvasSize.h);
            setSamOverlay(result.overlay);
            setBoundingBox(result.bounding_box);
        } catch (err: any) {
            setSamError(err.message ?? 'SAM server unreachable');
        } finally {
            setSamLoading(false);
        }
    };

    // ---------------------------------------------------------------------------
    // Button actions
    // ---------------------------------------------------------------------------

    const handleReset = () => {
        setPoints([]);
        setSamOverlay(null);
        setBoundingBox(null);
        setSamError(null);
    };

    const handleSkip = () => {
        if (selectedCat) loadNextRecord(selectedCat);
    };

    const handleNotThisCat = async () => {
        if (!creds || !currentRecord) return;
        setSaving(true);
        try {
            await unlabelRecord(creds, currentRecord);
            if (selectedCat) await loadNextRecord(selectedCat);
        } finally {
            setSaving(false);
        }
    };

    const handleSave = async () => {
        if (!creds || !currentRecord || !boundingBox || !username) return;
        setSaving(true);
        try {
            await saveBoundingData(creds, currentRecord, boundingBox, points, username);
            // Refresh stats in background
            getBoundingStats(creds).then(setStats).catch(console.error);
            if (selectedCat) await loadNextRecord(selectedCat);
        } finally {
            setSaving(false);
        }
    };

    // ---------------------------------------------------------------------------
    // Render
    // ---------------------------------------------------------------------------

    if (tabId !== index) return null;

    // --- Overview ---
    if (view === 'overview') {
        return (
            <div style={{ padding: 24, color: '#eee' }}>
                <h2 style={{ marginBottom: 8 }}>Cat Bounding</h2>
                <p style={{ color: '#aaa', marginBottom: 24 }}>
                    Tap a cat to start adding bounding boxes to their images.
                </p>
                {statsLoading ? (
                    <p style={{ color: '#aaa' }}>Loading stats…</p>
                ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
                        {BOUNDABLE_CATS.map(cat => (
                            <StatCard
                                key={cat}
                                cat={cat}
                                stats={stats[cat] ?? { sorted: 0, bounded: 0 }}
                                onClick={() => enterAnnotating(cat)}
                            />
                        ))}
                    </div>
                )}
            </div>
        );
    }

    // --- Annotation view ---
    const canSave = !!boundingBox && !saving && !samLoading;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 80px)', padding: 12, gap: 12, color: '#eee' }}>

            {/* Top bar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <button
                    style={btnStyle('#555')}
                    onClick={() => { setView('overview'); clearAnnotation(); setRecordError(null); setCurrentRecord(null); }}
                >
                    ← Overview
                </button>
                <span style={{ fontWeight: 'bold', fontSize: 18 }}>{selectedCat}</span>
                {samLoading && <span style={{ color: '#aaa', fontSize: 14 }}>Segmenting…</span>}
                {samError && <span style={{ color: '#f66', fontSize: 14 }}>{samError}</span>}

                {/* Tap mode toggle */}
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                    <button
                        style={btnStyle(tapMode === 'positive' ? '#3a7a3a' : '#444')}
                        onClick={() => setTapMode('positive')}
                    >
                        ● Cat
                    </button>
                    <button
                        style={btnStyle(tapMode === 'negative' ? '#7a3a3a' : '#444')}
                        onClick={() => setTapMode('negative')}
                    >
                        ● Background
                    </button>
                </div>
            </div>

            {/* Image + canvas */}
            <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0 }}>
                {recordLoading && (
                    <p style={{ color: '#aaa' }}>Loading image…</p>
                )}
                {!recordLoading && recordError && (
                    <p style={{ color: '#f88' }}>Error: {recordError}</p>
                )}
                {!recordLoading && !currentRecord && !recordError && (
                    <p style={{ color: '#aaa' }}>
                        All {selectedCat} images are bounded! 🎉
                    </p>
                )}
                {!recordLoading && imageUrl && (
                    <div style={{ position: 'relative', maxHeight: '100%', maxWidth: '100%' }}>
                        <img
                            ref={imageRef}
                            src={imageUrl}
                            alt="annotate"
                            onLoad={onImageLoad}
                            style={{ display: 'block', maxHeight: 'calc(100vh - 200px)', maxWidth: '100%' }}
                            draggable={false}
                        />
                        {canvasSize.w > 0 && (
                            <canvas
                                ref={canvasRef}
                                width={canvasSize.w}
                                height={canvasSize.h}
                                style={{ position: 'absolute', top: 0, left: 0, cursor: 'crosshair', touchAction: 'none' }}
                                onPointerDown={onCanvasPointerDown}
                            />
                        )}
                    </div>
                )}
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
                <button style={btnStyle('#555')} onClick={handleReset} disabled={saving}>
                    Reset
                </button>
                <button style={btnStyle('#555')} onClick={handleSkip} disabled={saving || recordLoading}>
                    Skip
                </button>
                <button
                    style={btnStyle('#7a3a3a')}
                    onClick={handleNotThisCat}
                    disabled={saving || !currentRecord}
                >
                    That's not {selectedCat}!
                </button>
                <button
                    style={btnStyle(canSave ? '#3a7a3a' : '#2a4a2a')}
                    onClick={handleSave}
                    disabled={!canSave}
                >
                    {saving ? 'Saving…' : 'Save ✓'}
                </button>
            </div>
        </div>
    );
}

function btnStyle(bg: string): React.CSSProperties {
    return {
        background: bg,
        color: '#eee',
        border: 'none',
        borderRadius: 8,
        padding: '12px 20px',
        fontSize: 16,
        cursor: 'pointer',
        minWidth: 80,
    };
}
