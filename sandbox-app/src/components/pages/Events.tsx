import React, { useEffect, useState, useCallback } from 'react';
import { Credentials } from '@aws-sdk/client-cognito-identity';
import Page, { PageProps } from './Page';
import { CatcamEvent, getEvents } from '../../services/eventsService';

const TRIGGER_THRESHOLD = 0.80;

type EventsPageProps = PageProps & {
    creds: Credentials | null;
};

const EventsPage: React.FC<EventsPageProps> = (props) => {
    const { creds, tabId, index } = props;
    const [events, setEvents] = useState<CatcamEvent[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [minConfidence, setMinConfidence] = useState(0.5);
    const [selectedEvent, setSelectedEvent] = useState<CatcamEvent | null>(null);

    const fetchEvents = useCallback(async () => {
        if (!creds) return;
        setLoading(true);
        setError(null);
        try {
            const data = await getEvents(creds, minConfidence);
            setEvents(data);
        } catch (err: any) {
            setError(err.message ?? 'Failed to load events');
        } finally {
            setLoading(false);
        }
    }, [creds, minConfidence]);

    // Auto-load when tab becomes visible
    useEffect(() => {
        if (tabId === index && creds) {
            fetchEvents();
        }
    }, [tabId, index, creds, fetchEvents]);

    const formatTimestamp = (iso: string) => {
        return new Date(iso).toLocaleString('en-GB', {
            dateStyle: 'short',
            timeStyle: 'medium',
        });
    };

    const confidencePct = (v: number) => `${(v * 100).toFixed(1)}%`;

    const badgeStyle = (confidence: number): React.CSSProperties => {
        const isDetection = confidence >= TRIGGER_THRESHOLD;
        return {
            display: 'inline-block',
            padding: '2px 8px',
            borderRadius: 4,
            fontWeight: 'bold',
            fontSize: '0.8rem',
            backgroundColor: isDetection ? '#c0392b' : '#e67e22',
            color: 'white',
        };
    };

    const containerStyle: React.CSSProperties = {
        backgroundColor: '#1f2329',
        minHeight: 'calc(100vh - 120px)',
        color: 'white',
        padding: '16px',
    };

    const headerStyle: React.CSSProperties = {
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        marginBottom: 16,
        flexWrap: 'wrap',
    };

    const gridStyle: React.CSSProperties = {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
        gap: 12,
    };

    const cardStyle: React.CSSProperties = {
        backgroundColor: '#2c313a',
        borderRadius: 8,
        overflow: 'hidden',
        cursor: 'pointer',
        border: '1px solid #3a3f4b',
        transition: 'border-color 0.15s',
    };

    return (
        <Page tabId={tabId} index={index}>
            <div style={containerStyle}>
                <div style={headerStyle}>
                    <h4 style={{ margin: 0 }}>Catches</h4>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.9rem' }}>
                        Min confidence: <strong>{confidencePct(minConfidence)}</strong>
                        <input
                            type="range"
                            min={0.5} max={1.0} step={0.05}
                            value={minConfidence}
                            onChange={e => setMinConfidence(parseFloat(e.target.value))}
                            style={{ width: 120 }}
                        />
                    </label>
                    <button
                        className="btn btn-primary btn-sm"
                        onClick={fetchEvents}
                        disabled={loading || !creds}
                    >
                        {loading ? 'Loading…' : 'Refresh'}
                    </button>
                    <span style={{ fontSize: '0.85rem', color: '#aaa' }}>
                        {events.length} event{events.length !== 1 ? 's' : ''}
                        {' · '}
                        <span style={{ color: '#c0392b' }}>■</span> ≥{confidencePct(TRIGGER_THRESHOLD)} trigger
                        {' · '}
                        <span style={{ color: '#e67e22' }}>■</span> near-miss
                    </span>
                </div>

                {!creds && (
                    <p style={{ color: '#aaa' }}>Waiting for AWS credentials…</p>
                )}

                {error && (
                    <div className="alert alert-danger">{error}</div>
                )}

                {!loading && creds && events.length === 0 && !error && (
                    <p style={{ color: '#aaa' }}>No events found above {confidencePct(minConfidence)} confidence.</p>
                )}

                <div style={gridStyle}>
                    {events.map(event => (
                        <div
                            key={event.id}
                            style={cardStyle}
                            onClick={() => setSelectedEvent(event)}
                        >
                            {event.imageUrl ? (
                                <img
                                    src={event.imageUrl}
                                    alt="catcam frame"
                                    style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', display: 'block' }}
                                    loading="lazy"
                                />
                            ) : (
                                <div style={{
                                    width: '100%', aspectRatio: '4/3', backgroundColor: '#111',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555'
                                }}>
                                    No image
                                </div>
                            )}
                            <div style={{ padding: '6px 8px' }}>
                                <div><span style={badgeStyle(event.bootsConfidence)}>{confidencePct(event.bootsConfidence)}</span></div>
                                <div style={{ fontSize: '0.75rem', color: '#aaa', marginTop: 4 }}>
                                    {formatTimestamp(event.timestamp)}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Modal */}
                {selectedEvent && (
                    <div
                        style={{
                            position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            zIndex: 1000, padding: 16,
                        }}
                        onClick={() => setSelectedEvent(null)}
                    >
                        <div
                            style={{
                                backgroundColor: '#2c313a', borderRadius: 8, maxWidth: 720, width: '100%',
                                overflow: 'hidden',
                            }}
                            onClick={e => e.stopPropagation()}
                        >
                            {selectedEvent.imageUrl && (
                                <img
                                    src={selectedEvent.imageUrl}
                                    alt="catcam frame"
                                    style={{ width: '100%', maxHeight: '60vh', objectFit: 'contain', display: 'block' }}
                                />
                            )}
                            <div style={{ padding: 16 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                                    <span style={badgeStyle(selectedEvent.bootsConfidence)}>
                                        Boots {confidencePct(selectedEvent.bootsConfidence)}
                                    </span>
                                    {selectedEvent.bootsConfidence >= TRIGGER_THRESHOLD
                                        ? <span style={{ color: '#c0392b', fontSize: '0.85rem' }}>TRIGGERED deterrent</span>
                                        : <span style={{ color: '#e67e22', fontSize: '0.85rem' }}>Near-miss (below trigger threshold)</span>
                                    }
                                </div>
                                <div style={{ fontSize: '0.85rem', color: '#ccc' }}>
                                    <div><strong>Time:</strong> {formatTimestamp(selectedEvent.timestamp)}</div>
                                    <div style={{ wordBreak: 'break-all' }}><strong>File:</strong> {selectedEvent.imageName}</div>
                                </div>
                                <button
                                    className="btn btn-secondary btn-sm"
                                    style={{ marginTop: 12 }}
                                    onClick={() => setSelectedEvent(null)}
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </Page>
    );
};

export default EventsPage;
