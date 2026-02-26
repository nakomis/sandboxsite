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

// ── Design tokens (slate/grey, site-matching) ─────────────────────────────────
const C = {
    ctrl:        '#2a2d35',
    input:       '#1e2028',
    border:      '#3a3f4b',
    borderSubtle:'#2e3240',
    accent:      '#03A550',
    accentPress: '#2244aa',
    accentSave:  '#2563eb',
    text:        '#ccc',
    muted:       '#888',
    dim:         '#555',
    errorBg:     '#3a1515',
    errorBorder: '#5a2020',
};

const INJECTED_CSS = `
  .pcb-slider {
    -webkit-appearance: none;
    appearance: none;
    width: 100%;
    height: 2px;
    background: ${C.border};
    outline: none;
    cursor: pointer;
    border-radius: 1px;
    display: block;
  }
  .pcb-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 12px;
    height: 12px;
    background: ${C.accent};
    cursor: pointer;
    border-radius: 3px;
    border: none;
  }
  .pcb-slider::-moz-range-thumb {
    width: 12px;
    height: 12px;
    background: ${C.accent};
    cursor: pointer;
    border-radius: 3px;
    border: none;
    box-sizing: border-box;
  }
  @keyframes pcb-slider-expand {
    0%   { transform: scale(1, 1); }
    40%  { transform: scale(2, 2); }
    100% { transform: scale(1, 1); }
  }
  .pcb-slider-expanding {
    animation: pcb-slider-expand 0.5s ease;
    position: relative;
    z-index: 50;
    transform-origin: left center;
  }
  .pcb-btn { transition: filter 0.12s; }
  .pcb-btn:hover:not(:disabled) { filter: brightness(1.15); }
  .pcb-row:hover td { background: ${C.ctrl} !important; }
  @keyframes pcb-toast-in {
    from { opacity: 0; transform: translateY(-6px); }
    to   { opacity: 1; transform: translateY(0); }
  }
`;

// ── Component ─────────────────────────────────────────────────────────────────
const PCBPrinterPage: React.FC<PCBPrinterProps> = ({ tabId, index, creds }) => {
    const [fileName, setFileName] = useState<string | null>(null);
    const [fileContent, setFileContent] = useState<string | null>(null);
    const [options, setOptions] = useState<UIOptions>(DEFAULT_UI_OPTIONS);

    const [stlOutputs, setStlOutputs] = useState<StlOutputs | null>(null);
    const [generating, setGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [viewerMode, setViewerMode] = useState<ViewerMode>('svg');

    // Dynamic slider maxes and expand animation
    const [sliderMaxes, setSliderMaxes] = useState<Partial<Record<keyof UIOptions, number>>>({});
    const [expandingSlider, setExpandingSlider] = useState<keyof UIOptions | null>(null);
    // Cooldown ref: prevents re-triggering expansion mid-drag after the max has just doubled
    const expandCooldownRef = useRef<Set<keyof UIOptions>>(new Set());

    // Save/Load state
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
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

    // Auto-dismiss save success toast
    useEffect(() => {
        if (!saveSuccess) return;
        const t = setTimeout(() => setSaveSuccess(null), 3000);
        return () => clearTimeout(t);
    }, [saveSuccess]);

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

            const svgHash = await hashBuffer(fileContent);
            const { major, minor } = await getVersionNumbers(baseName, svgHash, creds);
            const version = `${major}.${minor}`;

            const versionedSvg = resolveVersion(fileContent, version);
            const versionedOutputs = await runBuild(versionedSvg, options);

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
            setStlOutputs(versionedOutputs);
            setSaveSuccess(`Saved v${version}`);
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
            const svgText = new TextDecoder().decode(svgBuf);
            setFileName(record.filename + '.svg');
            setFileContent(svgText);
            setOptions(record.options);
            setStlOutputs({ pcb: pcbBuf, press: pressBuf });
            setViewerMode('pcb');

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

        if (ctx.mesh) {
            ctx.scene.remove(ctx.mesh);
            ctx.mesh.geometry.dispose();
            const mat = ctx.mesh.material as THREE.MeshBasicMaterial | THREE.MeshPhongMaterial;
            if ('map' in mat && mat.map) mat.map.dispose();
            mat.dispose();
            ctx.mesh = null;
        }

        const container = canvasRef.current;
        if (container) {
            const w = container.clientWidth || 720;
            const h = container.clientHeight || 400;
            ctx.renderer.setSize(w, h);
            ctx.camera.aspect = w / h;
            ctx.camera.updateProjectionMatrix();
        }

        if (viewerMode === 'svg' && fileContent) {
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

                ctx.camera.up.set(0, 1, 0);
                ctx.camera.position.set(0, 0, planeH * 1.5);
                ctx.camera.lookAt(0, 0, 0);
                ctx.controls.target.set(0, 0, 0);
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

    // ── Slider helper ─────────────────────────────────────────────────────────
    const renderSlider = (
        key: keyof UIOptions,
        label: string,
        min: number,
        defaultMax: number,
        step: number,
        unit = 'mm',
        hardMax?: number,
    ) => {
        const val = options[key] as number;
        const currentMax = sliderMaxes[key] ?? defaultMax;
        const isExpanding = expandingSlider === key;
        const decimals = unit === '' ? 0 : step < 0.1 ? 2 : step < 1 ? 1 : 0;
        const displayVal = val.toFixed(decimals) + unit;
        return (
            <div key={key} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ color: '#aaa', fontSize: 13 }}>{label}</span>
                    <span style={{ color: '#ccc', fontSize: 13, minWidth: 48, textAlign: 'right' }}>{displayVal}</span>
                </div>
                <div
                    className={isExpanding ? 'pcb-slider-expanding' : undefined}
                    style={{ position: 'relative', transformOrigin: 'left center' }}
                >
                    <input
                        type="range"
                        className="pcb-slider"
                        min={min}
                        max={currentMax}
                        step={step}
                        value={val}
                        onChange={e => {
                            // During the animation cooldown, ignore all events (including the
                            // browser's re-sample of the thumb position after max doubles).
                            if (expandCooldownRef.current.has(key)) return;
                            const num = unit === '' ? parseInt(e.target.value, 10) : parseFloat(e.target.value);
                            setOptions(prev => ({ ...prev, [key]: num }));
                            if (num >= currentMax
                                && !(hardMax !== undefined && currentMax >= hardMax)) {
                                const newMax = hardMax !== undefined
                                    ? Math.min(currentMax * 2, hardMax)
                                    : currentMax * 2;
                                expandCooldownRef.current.add(key);
                                setSliderMaxes(prev => ({ ...prev, [key]: newMax }));
                                setExpandingSlider(key);
                                setTimeout(() => {
                                    expandCooldownRef.current.delete(key);
                                    setExpandingSlider(null);
                                }, 550);
                            }
                        }}
                    />
                </div>
            </div>
        );
    };

    // ── Derived display values ────────────────────────────────────────────────
    const placeholderText = !fileContent
        ? 'Select an SVG file to preview'
        : viewerMode !== 'svg' && !stlOutputs
            ? 'Generate STLs to view a 3D preview'
            : null;

    const hintText = viewerMode === 'svg' && fileContent
        ? 'Drag to pan · scroll to zoom'
        : stlOutputs
            ? 'Drag to rotate · scroll to zoom'
            : null;

    // ── Shared button styles ──────────────────────────────────────────────────
    const btnBase: React.CSSProperties = {
        padding: '10px 20px',
        border: 'none',
        borderRadius: 4,
        fontSize: 15,
        cursor: 'pointer',
    };

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <Page tabId={tabId} index={index}>
            <style>{INJECTED_CSS}</style>
            <div style={{ color: '#ccc', padding: '8px 32px 16px' }}>

                {/* Header */}
                <div style={{ marginBottom: 6 }}>
                    <h1 style={{ color: '#fff', margin: 0 }}>PCB Printer</h1>
                </div>
                <h3 style={{ color: '#888', marginTop: 0, marginBottom: 14, fontWeight: 'normal' }}>Fritzing SVG to 3D-printable STL</h3>

                {/* Two-column layout */}
                <div style={{ display: 'flex', gap: 32, alignItems: 'stretch' }}>

                    {/* Left column: controls */}
                    <div style={{ flex: '0 0 360px', display: 'flex', flexDirection: 'column' }}>

                        {/* File upload */}
                        <section style={{ marginBottom: 14 }}>
                            <h3 style={{ color: '#ddd', marginBottom: 8 }}>Input file</h3>
                            <label style={{ cursor: 'pointer', display: 'block' }}>
                                <input type="file" accept=".svg" style={{ display: 'none' }} onChange={handleFileChange} />
                                <div style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 10,
                                    padding: '6px 14px',
                                    background: C.ctrl,
                                    border: `1px solid ${C.border}`,
                                    borderRadius: 4,
                                }}>
                                    <span style={{ color: '#aaa', fontSize: 14 }}>Choose SVG file</span>
                                </div>
                            </label>
                            {fileName && (
                                <span style={{ marginLeft: 12, color: '#4fc3f7', fontSize: 14 }}>{fileName}</span>
                            )}
                        </section>

                        {/* Options */}
                        <section style={{ flex: 1, marginBottom: 14 }}>
                            <h3 style={{ color: '#ddd', marginBottom: 10 }}>Options</h3>

                            <div style={{ color: '#666', fontSize: 12, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Board</div>
                            {renderSlider('boardThicknessMm', 'Board thickness', 0.5, 5.0, 0.1)}
                            {renderSlider('bumpChamferMm', 'Bump chamfer', 0, 1.0, 0.05)}

                            <div style={{ color: '#666', fontSize: 12, marginTop: 14, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Traces</div>
                            {renderSlider('traceRecessMm', 'Recess depth', 0, 1.0, 0.05)}
                            {renderSlider('traceClearanceMm', 'Clearance', 0, 0.5, 0.05)}
                            {renderSlider('drillDiameterMm', 'Drill diameter', 0.3, 3.0, 0.05)}

                            <div style={{ color: '#666', fontSize: 12, marginTop: 14, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Press</div>
                            {renderSlider('pressThicknessMm', 'Thickness', 1, 20, 0.5)}
                            {renderSlider('fingerIndentMm', 'Finger indent', 0, 20, 1)}

                            <div style={{ color: '#666', fontSize: 12, marginTop: 14, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Output</div>
                            {renderSlider('textReliefMm', 'Text relief', 0, 2.0, 0.1)}
                            {renderSlider('traceSegments', 'Segments (circle quality)', 8, 64, 4, '', 64)}
                        </section>

                        {/* Generate */}
                        <section style={{ marginBottom: 0 }}>
                            <button
                                onClick={generate}
                                disabled={!fileContent || generating}
                                className="pcb-btn"
                                style={{
                                    ...btnBase,
                                    padding: '10px 28px',
                                    background: fileContent && !generating ? C.accent : C.ctrl,
                                    color: fileContent && !generating ? '#fff' : C.dim,
                                    cursor: fileContent && !generating ? 'pointer' : 'not-allowed',
                                }}
                            >
                                {generating ? 'Triangulating…' : 'Generate STLs'}
                            </button>
                        </section>

                        {/* Errors */}
                        {(error || saveError) && (
                            <section style={{ marginTop: 10, padding: 12, background: C.errorBg, borderRadius: 4 }}>
                                <strong style={{ color: '#f44' }}>{saveError ? 'Save error:' : 'Error:'}</strong>{' '}
                                <span style={{ color: '#faa', fontSize: 14 }}>{saveError || error}</span>
                            </section>
                        )}
                    </div>

                    {/* Right column: preview + all actions */}
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>

                        {/* Viewer */}
                        <section style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                            <h3 style={{ color: '#ddd', marginBottom: 8 }}>Preview</h3>

                            {/* View mode tabs */}
                            <div style={{ display: 'flex', gap: 2, marginBottom: 0 }}>
                                {([
                                    { mode: 'svg' as const,   label: 'SVG',   enabled: !!fileContent, color: '#1a6b8a' },
                                    { mode: 'pcb' as const,   label: 'PCB',   enabled: !!stlOutputs,  color: C.accent },
                                    { mode: 'press' as const, label: 'Press', enabled: !!stlOutputs,  color: C.accentPress },
                                ]).map(({ mode, label, enabled, color }) => {
                                    const active = viewerMode === mode && enabled;
                                    return (
                                        <button
                                            key={mode}
                                            disabled={!enabled}
                                            onClick={() => setViewerMode(mode)}
                                            className="pcb-btn"
                                            style={{
                                                padding: '5px 16px',
                                                background: active ? color : C.ctrl,
                                                color: !enabled ? C.dim : active ? '#fff' : '#aaa',
                                                border: `1px solid ${active ? color : C.border}`,
                                                borderBottom: active ? `1px solid ${color}` : `1px solid ${C.border}`,
                                                borderRadius: '4px 4px 0 0',
                                                fontSize: 14,
                                                cursor: enabled ? 'pointer' : 'not-allowed',
                                                position: 'relative',
                                                bottom: -1,
                                            }}
                                        >
                                            {label}
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Canvas */}
                            <div style={{ flex: 1, position: 'relative', minHeight: 320 }}>
                                <div
                                    ref={canvasRef}
                                    style={{
                                        position: 'absolute',
                                        inset: 0,
                                        borderRadius: '0 4px 4px 4px',
                                        overflow: 'hidden',
                                        border: `1px solid ${C.border}`,
                                    }}
                                />
                                {placeholderText && (
                                    <div style={{
                                        position: 'absolute', inset: 0,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        color: C.dim, fontSize: 14,
                                        pointerEvents: 'none',
                                        borderRadius: '0 4px 4px 4px',
                                        border: `1px solid ${C.border}`,
                                    }}>
                                        {placeholderText}
                                    </div>
                                )}
                                {hintText && (
                                    <p style={{
                                        position: 'absolute', bottom: 8, right: 12,
                                        color: C.dim, fontSize: 12,
                                        margin: 0, pointerEvents: 'none',
                                    }}>
                                        {hintText}
                                    </p>
                                )}
                            </div>
                        </section>

                        {/* All action buttons in one row, with a divider between local and cloud */}
                        <section style={{ paddingTop: 12 }}>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                <button
                                    disabled={!stlOutputs}
                                    onClick={() => stlOutputs && downloadStl(stlOutputs.pcb, (fileName ?? 'pcb') + '-pcb.stl')}
                                    className="pcb-btn"
                                    style={{
                                        ...btnBase,
                                        background: stlOutputs ? C.accent : C.ctrl,
                                        color: stlOutputs ? '#fff' : C.dim,
                                        cursor: stlOutputs ? 'pointer' : 'not-allowed',
                                    }}
                                >
                                    Download PCB
                                </button>
                                <button
                                    disabled={!stlOutputs}
                                    onClick={() => stlOutputs && downloadStl(stlOutputs.press, (fileName ?? 'pcb') + '-press.stl')}
                                    className="pcb-btn"
                                    style={{
                                        ...btnBase,
                                        background: stlOutputs ? C.accentPress : C.ctrl,
                                        color: stlOutputs ? '#fff' : C.dim,
                                        cursor: stlOutputs ? 'pointer' : 'not-allowed',
                                    }}
                                >
                                    Download Press
                                </button>

                                {/* Divider */}
                                <div style={{ width: 1, height: 28, background: C.border, margin: '0 4px' }} />

                                <button
                                    disabled={!stlOutputs || saving || !creds}
                                    onClick={handleSave}
                                    className="pcb-btn"
                                    style={{
                                        ...btnBase,
                                        background: stlOutputs && !saving && creds ? C.accentSave : C.ctrl,
                                        color: stlOutputs && !saving && creds ? '#fff' : C.dim,
                                        cursor: stlOutputs && !saving && creds ? 'pointer' : 'not-allowed',
                                    }}
                                >
                                    {saving ? 'Saving…' : 'Save'}
                                </button>
                                <button
                                    disabled={!creds}
                                    onClick={handleLoad}
                                    className="pcb-btn"
                                    style={{
                                        ...btnBase,
                                        background: C.ctrl,
                                        color: creds ? '#ccc' : C.dim,
                                        border: `1px solid ${creds ? C.border : C.borderSubtle}`,
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

            {/* Save success toast */}
            {saveSuccess && (
                <div style={{
                    position: 'fixed', top: 20, right: 20, zIndex: 2000,
                    background: '#0d2918',
                    border: `1px solid ${C.accent}`,
                    borderRadius: 4,
                    padding: '10px 18px',
                    fontSize: 14,
                    color: C.accent,
                    animation: 'pcb-toast-in 0.2s ease',
                }}>
                    ✓ {saveSuccess}
                </div>
            )}

            {/* Load modal */}
            {loadOpen && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 1000,
                    background: 'rgba(0,0,0,0.75)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                    <div style={{
                        background: '#1e2028',
                        border: `1px solid ${C.border}`,
                        borderRadius: 8,
                        padding: 24,
                        width: 860,
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
                                    border: `1px solid ${C.border}`,
                                    borderRadius: 4,
                                    color: '#aaa',
                                    cursor: 'pointer',
                                    padding: '2px 10px',
                                    fontSize: 16,
                                }}
                            >✕</button>
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
                                        <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                                            {[
                                                'Filename',
                                                'Version',
                                                'Saved',
                                                'Thickness (mm)',
                                                'Recess (mm)',
                                                'Clearance (mm)',
                                                'pcbprinter',
                                            ].map(h => (
                                                <th key={h} style={{ color: '#888', textAlign: 'left', padding: '6px 10px', fontWeight: 500 }}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {savedRecords.map(rec => (
                                            <tr
                                                key={rec.id}
                                                className="pcb-row"
                                                onClick={() => handleLoadRecord(rec)}
                                                style={{ borderBottom: `1px solid ${C.borderSubtle}`, cursor: 'pointer' }}
                                            >
                                                <td style={{ color: '#4fc3f7', padding: '8px 10px' }}>{rec.filename}</td>
                                                <td style={{ color: '#ccc', padding: '8px 10px' }}>{rec.majorVersion}.{rec.minorVersion}</td>
                                                <td style={{ color: '#aaa', padding: '8px 10px' }}>{new Date(rec.timestamp).toLocaleString()}</td>
                                                <td style={{ color: '#aaa', padding: '8px 10px' }}>{rec.options.boardThicknessMm}</td>
                                                <td style={{ color: '#aaa', padding: '8px 10px' }}>{rec.options.traceRecessMm}</td>
                                                <td style={{ color: '#aaa', padding: '8px 10px' }}>{rec.options.traceClearanceMm}</td>
                                                <td style={{ color: '#666', padding: '8px 10px' }}>{rec.pcbprinterVersion}</td>
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
