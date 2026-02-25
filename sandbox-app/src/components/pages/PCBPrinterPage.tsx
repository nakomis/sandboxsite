import React, { useCallback, useEffect, useRef, useState } from 'react';
import Page, { PageProps } from './Page';
import {
    Credentials as AWSCredentials,
} from '@aws-sdk/client-cognito-identity';
import {
    parseFritzingSvg,
    snapTracesToPads,
    buildStls,
    DEFAULT_OPTIONS,
} from 'pcbprinter';
import type { PrinterOptions, StlOutputs } from 'pcbprinter';
import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import type { PcbSaveRecord } from '../../dto/PcbSaveRecord';
import {
    hashBuffer,
    getVersionNumbers,
    uploadIfAbsent,
    saveRecord,
    loadRecords,
    downloadFromS3,
} from '../../services/pcbPrinterSaveService';
import Config from '../../config/config';

type PCBPrinterProps = PageProps & {
    creds: AWSCredentials | null;
};

type ViewerMode = 'svg' | 'pcb' | 'press';

// Subset of PrinterOptions relevant to the UI (outDir and writeSvg are CLI-only)
export type UIOptions = Omit<PrinterOptions, 'outDir' | 'writeSvg' | 'boardColor' | 'snapToleranceMm'>;

const DEFAULT_UI_OPTIONS: UIOptions = {
    boardThicknessMm: DEFAULT_OPTIONS.boardThicknessMm,
    traceRecessMm: DEFAULT_OPTIONS.traceRecessMm,
    traceClearanceMm: DEFAULT_OPTIONS.traceClearanceMm,
    bumpChamferMm: DEFAULT_OPTIONS.bumpChamferMm,
    pressThicknessMm: DEFAULT_OPTIONS.pressThicknessMm,
    fingerIndentMm: DEFAULT_OPTIONS.fingerIndentMm,
    textReliefMm: 0.5,
    drillDiameterMm: DEFAULT_OPTIONS.drillDiameterMm,
    traceSegments: DEFAULT_OPTIONS.traceSegments,
};

// Fetch font data for text relief
async function loadFont(): Promise<ArrayBuffer | null> {
    try {
        const resp = await fetch(process.env.PUBLIC_URL + '/fonts/DroidSansMono.ttf');
        return await resp.arrayBuffer();
    } catch {
        return null;
    }
}

// Resolve {version} placeholder in SVG content
function resolveVersion(svgContent: string, version: string): string {
    return svgContent.replace(/\{version\}/g, version);
}

const PCBPrinterPage: React.FC<PCBPrinterProps> = ({ tabId, index, creds }) => {
    const [fileName, setFileName] = useState<string | null>(null);
    const [fileContent, setFileContent] = useState<string | null>(null);
    const [options, setOptions] = useState<UIOptions>(DEFAULT_UI_OPTIONS);

    const [stlOutputs, setStlOutputs] = useState<StlOutputs | null>(null);
    const [generating, setGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [viewerMode, setViewerMode] = useState<ViewerMode>('svg');

    // Save/Load state
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [loadOpen, setLoadOpen] = useState(false);
    const [savedRecords, setSavedRecords] = useState<PcbSaveRecord[] | null>(null);
    const [loadingRecords, setLoadingRecords] = useState(false);

    // STL viewer refs
    const canvasRef = useRef<HTMLDivElement>(null);
    const sceneRef = useRef<{
        renderer: THREE.WebGLRenderer;
        scene: THREE.Scene;
        camera: THREE.PerspectiveCamera;
        controls: OrbitControls;
        mesh: THREE.Mesh | null;
        animFrame: number;
    } | null>(null);

    // Auto-switch to SVG preview when a file is loaded
    useEffect(() => {
        if (fileContent) setViewerMode('svg');
    }, [fileContent]);

    const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setFileName(file.name);
        setStlOutputs(null);
        setError(null);
        setSaveError(null);
        const reader = new FileReader();
        reader.onload = (evt) => {
            setFileContent(evt.target?.result as string ?? null);
        };
        reader.readAsText(file);
    }, []);

    const handleOption = useCallback(<K extends keyof UIOptions>(key: K, value: UIOptions[K]) => {
        setOptions(prev => ({ ...prev, [key]: value }));
    }, []);

    const runBuild = useCallback(async (svgContent: string, opts: UIOptions): Promise<StlOutputs> => {
        const fullOptions: PrinterOptions = { ...DEFAULT_OPTIONS, ...opts };
        if (fullOptions.textReliefMm > 0) {
            const fontData = await loadFont();
            if (fontData) fullOptions.fontData = fontData;
        }
        const model = parseFritzingSvg(svgContent, fullOptions);
        snapTracesToPads(model, fullOptions);
        return buildStls(model, fullOptions, {
            locateFile: (f: string) => process.env.PUBLIC_URL + '/' + f,
        });
    }, []);

    const generate = useCallback(async () => {
        if (!fileContent) return;
        setGenerating(true);
        setError(null);
        setStlOutputs(null);
        try {
            const outputs = await runBuild(fileContent, options);
            setStlOutputs(outputs);
            setViewerMode('pcb');
        } catch (err) {
            setError(String(err));
        } finally {
            setGenerating(false);
        }
    }, [fileContent, options, runBuild]);

    const handleSave = useCallback(async () => {
        if (!fileContent || !creds || !fileName) return;
        setSaving(true);
        setSaveError(null);
        try {
            const bucket = Config.pcbPrinter.bucket;
            const baseName = fileName.replace(/\.svg$/i, '');

            // Hash original SVG to determine versioning
            const svgHash = await hashBuffer(fileContent);
            const { major, minor } = await getVersionNumbers(baseName, svgHash, creds);
            const version = `${major}.${minor}`;

            // Substitute {version} and re-run build with versioned SVG
            const versionedSvg = resolveVersion(fileContent, version);
            const versionedOutputs = await runBuild(versionedSvg, options);

            // Hash the three artefacts
            const [svgStoreHash, pcbHash, pressHash] = await Promise.all([
                hashBuffer(versionedSvg),
                hashBuffer(versionedOutputs.pcb),
                hashBuffer(versionedOutputs.press),
            ]);

            const svgKey = `svg/${svgStoreHash}.svg`;
            const pcbStlKey = `stl/${pcbHash}-pcb.stl`;
            const pressStlKey = `stl/${pressHash}-press.stl`;

            await Promise.all([
                uploadIfAbsent(bucket, svgKey, versionedSvg, 'image/svg+xml', creds),
                uploadIfAbsent(bucket, pcbStlKey, versionedOutputs.pcb, 'model/stl', creds),
                uploadIfAbsent(bucket, pressStlKey, versionedOutputs.press, 'model/stl', creds),
            ]);

            const now = new Date();
            const record: PcbSaveRecord = {
                id: crypto.randomUUID(),
                filename: baseName,
                svgHash,
                majorVersion: major,
                minorVersion: minor,
                svgKey,
                pcbStlKey,
                pressStlKey,
                options,
                timestamp: now.toISOString(),
                sandboxVersion: process.env.REACT_APP_VERSION ?? 'unknown',
                pcbprinterVersion: '0.3.0',
                ttl: Math.floor(now.getTime() / 1000) + 30 * 24 * 60 * 60,
            };

            await saveRecord(record, creds);

            // Update viewer to show the versioned STLs
            setStlOutputs(versionedOutputs);
        } catch (err) {
            setSaveError(String(err));
        } finally {
            setSaving(false);
        }
    }, [fileContent, fileName, creds, options, runBuild]);

    const handleLoad = useCallback(async () => {
        if (!creds) return;
        setLoadOpen(true);
        setLoadingRecords(true);
        setSavedRecords(null);
        try {
            const records = await loadRecords(creds);
            setSavedRecords(records);
        } finally {
            setLoadingRecords(false);
        }
    }, [creds]);

    const handleLoadRecord = useCallback(async (record: PcbSaveRecord) => {
        if (!creds) return;
        setLoadOpen(false);
        const bucket = Config.pcbPrinter.bucket;
        try {
            const [svgBuf, pcbBuf, pressBuf] = await Promise.all([
                downloadFromS3(bucket, record.svgKey, creds),
                downloadFromS3(bucket, record.pcbStlKey, creds),
                downloadFromS3(bucket, record.pressStlKey, creds),
            ]);
            // Trigger SVG file download (so user's file input reflects the loaded file)
            const svgText = new TextDecoder().decode(svgBuf);
            setFileName(record.filename + '.svg');
            setFileContent(svgText);
            setOptions(record.options);
            setStlOutputs({ pcb: pcbBuf, press: pressBuf });
            setViewerMode('pcb');

            // Download all three files to disk
            const downloads: [ArrayBuffer, string, string][] = [
                [svgBuf, record.filename + '.svg', 'image/svg+xml'],
                [pcbBuf, record.filename + '-pcb.stl', 'model/stl'],
                [pressBuf, record.filename + '-press.stl', 'model/stl'],
            ];
            for (const [buf, name, type] of downloads) {
                const blob = new Blob([buf], { type });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = name;
                a.click();
                URL.revokeObjectURL(url);
            }
        } catch (err) {
            setSaveError(String(err));
        }
    }, [creds]);

    const downloadStl = useCallback((buf: ArrayBuffer, name: string) => {
        const blob = new Blob([buf], { type: 'model/stl' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        a.click();
        URL.revokeObjectURL(url);
    }, []);

    // ── Three.js viewer ───────────────────────────────────────────────────────
    useEffect(() => {
        const container = canvasRef.current;
        if (!container) return;

        const width = container.clientWidth || 600;
        const height = 350;

        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(width, height);
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setClearColor(0x1e1e1e);
        container.appendChild(renderer.domElement);

        const scene = new THREE.Scene();

        const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
        camera.position.set(0, -120, 80);
        camera.up.set(0, 0, 1);

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
        scene.add(ambientLight);
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
        dirLight.position.set(1, -1, 2);
        scene.add(dirLight);

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;

        let animFrame = 0;
        const animate = () => {
            animFrame = requestAnimationFrame(animate);
            controls.update();
            renderer.render(scene, camera);
        };
        animate();

        sceneRef.current = { renderer, scene, camera, controls, mesh: null, animFrame };

        return () => {
            cancelAnimationFrame(animFrame);
            controls.dispose();
            renderer.dispose();
            if (container.contains(renderer.domElement)) {
                container.removeChild(renderer.domElement);
            }
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Load content into viewer when mode or content changes
    useEffect(() => {
        const ctx = sceneRef.current;
        if (!ctx) return;
        let cancelled = false;

        // Clear existing mesh and dispose its resources
        if (ctx.mesh) {
            ctx.scene.remove(ctx.mesh);
            ctx.mesh.geometry.dispose();
            const mat = ctx.mesh.material as THREE.MeshBasicMaterial | THREE.MeshPhongMaterial;
            if ('map' in mat && mat.map) mat.map.dispose();
            mat.dispose();
            ctx.mesh = null;
        }

        // Resize renderer to actual container dimensions
        const container = canvasRef.current;
        if (container) {
            const w = container.clientWidth || 720;
            const h = container.clientHeight || 400;
            ctx.renderer.setSize(w, h);
            ctx.camera.aspect = w / h;
            ctx.camera.updateProjectionMatrix();
        }

        if (viewerMode === 'svg' && fileContent) {
            // Parse aspect ratio from SVG width/height or viewBox
            const parser = new DOMParser();
            const svgDoc = parser.parseFromString(fileContent, 'image/svg+xml');
            const svgEl = svgDoc.documentElement;
            let svgW = parseFloat(svgEl.getAttribute('width') || '0');
            let svgH = parseFloat(svgEl.getAttribute('height') || '0');
            const vb = svgEl.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number);
            if ((!svgW || !svgH) && vb && vb.length === 4) { svgW = vb[2]; svgH = vb[3]; }
            const aspect = (svgW && svgH) ? svgW / svgH : 4 / 3;

            const blob = new Blob([fileContent], { type: 'image/svg+xml' });
            const url = URL.createObjectURL(blob);
            new THREE.TextureLoader().load(url, (texture) => {
                URL.revokeObjectURL(url);
                if (cancelled) { texture.dispose(); return; }

                const planeH = 100;
                const geo = new THREE.PlaneGeometry(planeH * aspect, planeH);
                const mat = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
                const mesh = new THREE.Mesh(geo, mat);

                // Camera faces the XY plane from +Z; Y-up for natural SVG orientation
                ctx.camera.up.set(0, 1, 0);
                ctx.camera.position.set(0, 0, planeH * 1.5);
                ctx.camera.lookAt(0, 0, 0);
                ctx.controls.target.set(0, 0, 0);
                // Pan + zoom only for flat SVG; rotation is confusing for a 2D image
                ctx.controls.enableRotate = false;
                ctx.controls.saveState();
                ctx.controls.update();

                ctx.scene.add(mesh);
                ctx.mesh = mesh;
            }, undefined, () => URL.revokeObjectURL(url));

        } else if ((viewerMode === 'pcb' || viewerMode === 'press') && stlOutputs) {
            const buf = viewerMode === 'pcb' ? stlOutputs.pcb : stlOutputs.press;
            const loader = new STLLoader();
            const geometry = loader.parse(buf);
            geometry.computeVertexNormals();

            const material = new THREE.MeshPhongMaterial({
                color: viewerMode === 'pcb' ? 0x03A550 : 0x2244aa,
                specular: 0x444444,
                shininess: 40,
            });
            const mesh = new THREE.Mesh(geometry, material);

            geometry.computeBoundingBox();
            const box = geometry.boundingBox!;
            const centre = new THREE.Vector3();
            box.getCenter(centre);
            mesh.position.sub(centre);

            const size = new THREE.Vector3();
            box.getSize(size);
            const maxDim = Math.max(size.x, size.y, size.z);

            // Restore Z-up for 3D STL viewing
            ctx.camera.up.set(0, 0, 1);
            ctx.camera.position.set(0, -maxDim * 1.8, maxDim * 1.2);
            ctx.camera.lookAt(0, 0, 0);
            ctx.controls.target.set(0, 0, 0);
            ctx.controls.enableRotate = true;
            ctx.controls.saveState();
            ctx.controls.update();

            ctx.scene.add(mesh);
            ctx.mesh = mesh;
        }

        return () => { cancelled = true; };
    }, [stlOutputs, viewerMode, fileContent]);

    const inputStyle: React.CSSProperties = {
        background: '#2a2d35',
        border: '1px solid #444',
        borderRadius: 4,
        color: '#ccc',
        padding: '4px 8px',
        width: 100,
    };
    const labelStyle: React.CSSProperties = {
        color: '#aaa',
        fontSize: 14,
        minWidth: 200,
        display: 'inline-block',
    };
    const rowStyle: React.CSSProperties = {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        marginBottom: 5,
    };

    const placeholderText = !fileContent
        ? 'Select an SVG file to preview'
        : viewerMode !== 'svg' && !stlOutputs
            ? 'Generate STLs to view a preview'
            : null;

    const hintText = viewerMode === 'svg' && fileContent
        ? 'Drag to pan · scroll to zoom'
        : stlOutputs
            ? 'Drag to rotate · scroll to zoom'
            : null;

    const btnBase: React.CSSProperties = {
        padding: '10px 20px',
        border: 'none',
        borderRadius: 4,
        fontSize: 16,
    };

    return (
        <Page tabId={tabId} index={index}>
            <div className="page" style={{ color: '#ccc', padding: '8px 32px 16px' }}>
                {/* Header row */}
                <div style={{ marginBottom: 6 }}>
                    <h1 style={{ color: '#fff', margin: 0 }}>PCB Printer</h1>
                </div>
                <p style={{ color: '#888', marginBottom: 10, fontSize: 14 }}>
                    Export your PCB from Fritzing via <em>File → Export → as Image → SVG…</em>
                </p>

                {/* Two-column layout */}
                <div style={{ display: 'flex', gap: 32, alignItems: 'stretch' }}>

                    {/* Left column: controls */}
                    <div style={{ flex: '0 0 360px', display: 'flex', flexDirection: 'column' }}>

                        {/* File upload */}
                        <section style={{ marginBottom: 10 }}>
                            <h3 style={{ color: '#ddd', marginBottom: 6 }}>Input file</h3>
                            <label
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    cursor: 'pointer',
                                    padding: '4px 10px',
                                    background: '#2a2d35',
                                    border: '1px solid #444',
                                    borderRadius: 4,
                                }}
                            >
                                <input
                                    type="file"
                                    accept=".svg"
                                    style={{ display: 'none' }}
                                    onChange={handleFileChange}
                                />
                                <span style={{ color: '#aaa', fontSize: 13 }}>Choose SVG file</span>
                            </label>
                            {fileName && (
                                <span style={{ marginLeft: 12, color: '#4fc3f7', fontSize: 13 }}>{fileName}</span>
                            )}
                        </section>

                        {/* Options form */}
                        <section style={{ flex: 1, marginBottom: 10 }}>
                            <h3 style={{ color: '#ddd', marginBottom: 6 }}>Options</h3>
                            <div style={rowStyle}>
                                <span style={labelStyle}>Board thickness (mm)</span>
                                <input type="number" step="0.1" value={options.boardThicknessMm}
                                    onChange={e => handleOption('boardThicknessMm', parseFloat(e.target.value))} style={inputStyle} />
                            </div>
                            <div style={rowStyle}>
                                <span style={labelStyle}>Trace recess depth (mm)</span>
                                <input type="number" step="0.05" value={options.traceRecessMm}
                                    onChange={e => handleOption('traceRecessMm', parseFloat(e.target.value))} style={inputStyle} />
                            </div>
                            <div style={rowStyle}>
                                <span style={labelStyle}>Trace clearance (mm)</span>
                                <input type="number" step="0.05" value={options.traceClearanceMm}
                                    onChange={e => handleOption('traceClearanceMm', parseFloat(e.target.value))} style={inputStyle} />
                            </div>
                            <div style={rowStyle}>
                                <span style={labelStyle}>Bump chamfer (mm)</span>
                                <input type="number" step="0.05" min="0" value={options.bumpChamferMm}
                                    onChange={e => handleOption('bumpChamferMm', parseFloat(e.target.value))} style={inputStyle} />
                            </div>
                            <div style={rowStyle}>
                                <span style={labelStyle}>Press thickness (mm)</span>
                                <input type="number" step="0.5" value={options.pressThicknessMm}
                                    onChange={e => handleOption('pressThicknessMm', parseFloat(e.target.value))} style={inputStyle} />
                            </div>
                            <div style={rowStyle}>
                                <span style={labelStyle}>Finger indent depth (mm)</span>
                                <input type="number" step="1" min="0" value={options.fingerIndentMm}
                                    onChange={e => handleOption('fingerIndentMm', parseFloat(e.target.value))} style={inputStyle} />
                            </div>
                            <div style={rowStyle}>
                                <span style={labelStyle}>Text relief (mm)</span>
                                <input type="number" step="0.1" min="0" value={options.textReliefMm}
                                    onChange={e => handleOption('textReliefMm', parseFloat(e.target.value))} style={inputStyle} />
                            </div>
                            <div style={rowStyle}>
                                <span style={labelStyle}>Drill diameter (mm)</span>
                                <input type="number" step="0.05" value={options.drillDiameterMm}
                                    onChange={e => handleOption('drillDiameterMm', parseFloat(e.target.value))} style={inputStyle} />
                            </div>
                            <div style={rowStyle}>
                                <span style={labelStyle}>Trace segments (circle quality)</span>
                                <input type="number" step="4" min="8" max="64" value={options.traceSegments}
                                    onChange={e => handleOption('traceSegments', parseInt(e.target.value, 10))} style={inputStyle} />
                            </div>
                        </section>

                        {/* Generate button */}
                        <section style={{ marginBottom: 0 }}>
                            <button
                                onClick={generate}
                                disabled={!fileContent || generating}
                                style={{
                                    padding: '10px 28px',
                                    background: fileContent && !generating ? '#03A550' : '#2a2d35',
                                    color: fileContent && !generating ? '#fff' : '#555',
                                    border: 'none',
                                    borderRadius: 4,
                                    fontSize: 16,
                                    cursor: fileContent && !generating ? 'pointer' : 'not-allowed',
                                }}
                            >
                                {generating ? 'Triangulating…' : 'Generate STLs'}
                            </button>
                        </section>

                        {/* Error */}
                        {error && (
                            <section style={{ marginTop: 10, padding: 12, background: '#3a1515', borderRadius: 4 }}>
                                <strong style={{ color: '#f44' }}>Error:</strong>{' '}
                                <span style={{ color: '#faa', fontSize: 14 }}>{error}</span>
                            </section>
                        )}
                        {saveError && (
                            <section style={{ marginTop: 10, padding: 12, background: '#3a1515', borderRadius: 4 }}>
                                <strong style={{ color: '#f44' }}>Save error:</strong>{' '}
                                <span style={{ color: '#faa', fontSize: 14 }}>{saveError}</span>
                            </section>
                        )}
                    </div>

                    {/* Right column: preview fills space, downloads pin to bottom */}
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>

                        {/* Viewer — always visible */}
                        <section style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                            <h3 style={{ color: '#ddd', marginBottom: 6 }}>Preview</h3>
                            <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
                                {/* SVG button */}
                                <button
                                    disabled={!fileContent}
                                    onClick={() => setViewerMode('svg')}
                                    style={{
                                        padding: '4px 14px',
                                        background: fileContent && viewerMode === 'svg' ? '#1a6b8a' : '#2a2d35',
                                        color: fileContent ? '#fff' : '#555',
                                        border: '1px solid #444',
                                        borderRadius: 4,
                                        cursor: fileContent ? 'pointer' : 'not-allowed',
                                    }}
                                >
                                    SVG
                                </button>
                                {/* PCB button */}
                                <button
                                    disabled={!stlOutputs}
                                    onClick={() => setViewerMode('pcb')}
                                    style={{
                                        padding: '4px 14px',
                                        background: stlOutputs && viewerMode === 'pcb' ? '#03A550' : '#2a2d35',
                                        color: stlOutputs ? '#fff' : '#555',
                                        border: '1px solid #444',
                                        borderRadius: 4,
                                        cursor: stlOutputs ? 'pointer' : 'not-allowed',
                                    }}
                                >
                                    PCB
                                </button>
                                {/* Press button */}
                                <button
                                    disabled={!stlOutputs}
                                    onClick={() => setViewerMode('press')}
                                    style={{
                                        padding: '4px 14px',
                                        background: stlOutputs && viewerMode === 'press' ? '#2244aa' : '#2a2d35',
                                        color: stlOutputs ? '#fff' : '#555',
                                        border: '1px solid #444',
                                        borderRadius: 4,
                                        cursor: stlOutputs ? 'pointer' : 'not-allowed',
                                    }}
                                >
                                    Press
                                </button>
                            </div>
                            <div style={{ flex: 1, position: 'relative', minHeight: 200 }}>
                                <div
                                    ref={canvasRef}
                                    style={{
                                        position: 'absolute',
                                        inset: 0,
                                        borderRadius: 4,
                                        overflow: 'hidden',
                                        border: '1px solid #333',
                                    }}
                                />
                                {placeholderText && (
                                    <div style={{
                                        position: 'absolute',
                                        inset: 0,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: '#555',
                                        fontSize: 14,
                                        pointerEvents: 'none',
                                        borderRadius: 4,
                                        border: '1px solid #333',
                                    }}>
                                        {placeholderText}
                                    </div>
                                )}
                            </div>
                            {hintText && (
                                <p style={{ color: '#666', fontSize: 12, marginTop: 4 }}>
                                    {hintText}
                                </p>
                            )}
                        </section>

                        {/* Downloads — pinned to bottom of right column, inline with Generate */}
                        <section style={{ paddingTop: 12 }}>
                            <div style={{ display: 'flex', gap: 10 }}>
                                <button
                                    disabled={!stlOutputs}
                                    onClick={() => stlOutputs && downloadStl(stlOutputs.pcb, (fileName ?? 'pcb') + '-pcb.stl')}
                                    style={{
                                        ...btnBase,
                                        background: stlOutputs ? '#03A550' : '#2a2d35',
                                        color: stlOutputs ? '#fff' : '#555',
                                        cursor: stlOutputs ? 'pointer' : 'not-allowed',
                                    }}
                                >
                                    Download PCB
                                </button>
                                <button
                                    disabled={!stlOutputs}
                                    onClick={() => stlOutputs && downloadStl(stlOutputs.press, (fileName ?? 'pcb') + '-press.stl')}
                                    style={{
                                        ...btnBase,
                                        background: stlOutputs ? '#2244aa' : '#2a2d35',
                                        color: stlOutputs ? '#fff' : '#555',
                                        cursor: stlOutputs ? 'pointer' : 'not-allowed',
                                    }}
                                >
                                    Download Press
                                </button>
                                <button
                                    disabled={!stlOutputs || saving || !creds}
                                    onClick={handleSave}
                                    style={{
                                        ...btnBase,
                                        background: stlOutputs && !saving && creds ? '#2563eb' : '#2a2d35',
                                        color: stlOutputs && !saving && creds ? '#fff' : '#555',
                                        cursor: stlOutputs && !saving && creds ? 'pointer' : 'not-allowed',
                                    }}
                                >
                                    {saving ? 'Saving…' : 'Save'}
                                </button>
                                <button
                                    disabled={!creds}
                                    onClick={handleLoad}
                                    style={{
                                        ...btnBase,
                                        background: creds ? '#2a2d35' : '#2a2d35',
                                        color: creds ? '#ccc' : '#555',
                                        cursor: creds ? 'pointer' : 'not-allowed',
                                    }}
                                >
                                    Load
                                </button>
                            </div>
                        </section>
                    </div>
                </div>
            </div>

            {/* Load modal */}
            {loadOpen && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    zIndex: 1000,
                    background: 'rgba(0,0,0,0.7)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}>
                    <div style={{
                        background: '#1e2028',
                        border: '1px solid #444',
                        borderRadius: 8,
                        padding: 24,
                        width: 820,
                        maxWidth: '90vw',
                        maxHeight: '80vh',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 12,
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <h2 style={{ color: '#fff', margin: 0, fontSize: 18 }}>Saved designs</h2>
                            <button
                                onClick={() => setLoadOpen(false)}
                                style={{
                                    background: 'none',
                                    border: '1px solid #555',
                                    borderRadius: 4,
                                    color: '#aaa',
                                    cursor: 'pointer',
                                    padding: '2px 10px',
                                    fontSize: 16,
                                }}
                            >
                                ✕
                            </button>
                        </div>

                        {loadingRecords && (
                            <div style={{ color: '#888', textAlign: 'center', padding: 32 }}>Loading…</div>
                        )}

                        {!loadingRecords && savedRecords !== null && savedRecords.length === 0 && (
                            <div style={{ color: '#888', textAlign: 'center', padding: 32 }}>No saved designs found.</div>
                        )}

                        {!loadingRecords && savedRecords && savedRecords.length > 0 && (
                            <div style={{ overflowY: 'auto', flex: 1 }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid #333' }}>
                                            {['Filename', 'Version', 'Timestamp', 'Options', 'pcbprinter'].map(h => (
                                                <th key={h} style={{ color: '#888', textAlign: 'left', padding: '6px 10px', fontWeight: 500 }}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {savedRecords.map(rec => (
                                            <tr
                                                key={rec.id}
                                                onClick={() => handleLoadRecord(rec)}
                                                style={{
                                                    borderBottom: '1px solid #2a2d35',
                                                    cursor: 'pointer',
                                                }}
                                                onMouseEnter={e => (e.currentTarget.style.background = '#2a2d35')}
                                                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                            >
                                                <td style={{ color: '#4fc3f7', padding: '8px 10px' }}>{rec.filename}</td>
                                                <td style={{ color: '#ccc', padding: '8px 10px' }}>{rec.majorVersion}.{rec.minorVersion}</td>
                                                <td style={{ color: '#aaa', padding: '8px 10px' }}>{new Date(rec.timestamp).toLocaleString()}</td>
                                                <td style={{ color: '#aaa', padding: '8px 10px', fontSize: 12 }}>
                                                    t={rec.options.boardThicknessMm} r={rec.options.traceRecessMm} c={rec.options.traceClearanceMm}
                                                </td>
                                                <td style={{ color: '#888', padding: '8px 10px' }}>{rec.pcbprinterVersion}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </Page>
    );
};

export default PCBPrinterPage;
