import React, { useCallback, useEffect, useRef, useState } from 'react';
import Page, { PageProps } from './Page';
import {
    Credentials as AWSCredentials,
} from '@aws-sdk/client-cognito-identity';
import {
    parseFritzingSvg,
    parseFritzingFz,
    snapTracesToPads,
    buildStls,
    DEFAULT_OPTIONS,
} from 'pcbprinter';
import type { PrinterOptions, StlOutputs } from 'pcbprinter';
import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

type PCBPrinterProps = PageProps & {
    creds: AWSCredentials | null;
};

type ViewerMode = 'pcb' | 'press';

// Subset of PrinterOptions relevant to the UI (outDir and writeSvg are CLI-only)
type UIOptions = Omit<PrinterOptions, 'outDir' | 'writeSvg' | 'boardColor' | 'snapToleranceMm'>;

const DEFAULT_UI_OPTIONS: UIOptions = {
    boardThicknessMm: DEFAULT_OPTIONS.boardThicknessMm,
    traceRecessMm: DEFAULT_OPTIONS.traceRecessMm,
    traceClearanceMm: DEFAULT_OPTIONS.traceClearanceMm,
    bumpChamferMm: DEFAULT_OPTIONS.bumpChamferMm,
    pressThicknessMm: DEFAULT_OPTIONS.pressThicknessMm,
    fingerIndentMm: DEFAULT_OPTIONS.fingerIndentMm,
    textReliefMm: DEFAULT_OPTIONS.textReliefMm,
    drillDiameterMm: DEFAULT_OPTIONS.drillDiameterMm,
    traceSegments: DEFAULT_OPTIONS.traceSegments,
};

const PCBPrinterPage: React.FC<PCBPrinterProps> = ({ tabId, index }) => {
    const [fileName, setFileName] = useState<string | null>(null);
    const [fileContent, setFileContent] = useState<string | null>(null);
    const [fileExt, setFileExt] = useState<string>('.svg');
    const [options, setOptions] = useState<UIOptions>(DEFAULT_UI_OPTIONS);
    const [fontData, setFontData] = useState<ArrayBuffer | undefined>(undefined);
    const [fontName, setFontName] = useState<string | null>(null);
    const [stlOutputs, setStlOutputs] = useState<StlOutputs | null>(null);
    const [generating, setGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [viewerMode, setViewerMode] = useState<ViewerMode>('pcb');

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

    const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const ext = file.name.toLowerCase().endsWith('.fz') ? '.fz' : '.svg';
        setFileExt(ext);
        setFileName(file.name);
        setStlOutputs(null);
        setError(null);
        const reader = new FileReader();
        reader.onload = (evt) => {
            setFileContent(evt.target?.result as string ?? null);
        };
        reader.readAsText(file);
    }, []);

    const handleFontChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setFontName(file.name);
        const reader = new FileReader();
        reader.onload = (evt) => {
            setFontData(evt.target?.result as ArrayBuffer ?? undefined);
        };
        reader.readAsArrayBuffer(file);
    }, []);

    const handleOption = useCallback(<K extends keyof UIOptions>(key: K, value: UIOptions[K]) => {
        setOptions(prev => ({ ...prev, [key]: value }));
    }, []);

    const generate = useCallback(async () => {
        if (!fileContent) return;
        setGenerating(true);
        setError(null);
        setStlOutputs(null);
        try {
            const fullOptions: PrinterOptions = {
                ...DEFAULT_OPTIONS,
                ...options,
                fontData,
            };
            let model;
            if (fileExt === '.fz') {
                model = parseFritzingFz(fileContent);
            } else {
                model = parseFritzingSvg(fileContent, fullOptions);
            }
            snapTracesToPads(model, fullOptions);
            const outputs = await buildStls(model, fullOptions, {
                locateFile: (f: string) => process.env.PUBLIC_URL + '/' + f,
            });
            setStlOutputs(outputs);
        } catch (err) {
            setError(String(err));
        } finally {
            setGenerating(false);
        }
    }, [fileContent, fileExt, options, fontData]);

    const downloadStl = useCallback((buf: ArrayBuffer, name: string) => {
        const blob = new Blob([buf], { type: 'model/stl' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        a.click();
        URL.revokeObjectURL(url);
    }, []);

    // ── Three.js STL viewer ───────────────────────────────────────────────────
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

    // Load STL into viewer when outputs change or viewerMode changes
    useEffect(() => {
        const ctx = sceneRef.current;
        if (!ctx) return;

        if (ctx.mesh) {
            ctx.scene.remove(ctx.mesh);
            ctx.mesh.geometry.dispose();
            ctx.mesh = null;
        }

        if (!stlOutputs) return;

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

        // Centre the mesh
        geometry.computeBoundingBox();
        const box = geometry.boundingBox!;
        const centre = new THREE.Vector3();
        box.getCenter(centre);
        mesh.position.sub(centre);

        // Zoom camera to fit
        const size = new THREE.Vector3();
        box.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z);
        ctx.camera.position.set(0, -maxDim * 1.8, maxDim * 1.2);
        ctx.controls.reset();

        ctx.scene.add(mesh);
        ctx.mesh = mesh;
    }, [stlOutputs, viewerMode]);

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
        marginBottom: 8,
    };

    return (
        <Page tabId={tabId} index={index}>
            <div className="page" style={{ color: '#ccc', padding: '24px 32px', maxWidth: 800 }}>
                <h1 style={{ color: '#fff', marginBottom: 24 }}>PCB Printer</h1>
                <p style={{ color: '#888', marginBottom: 24, fontSize: 14 }}>
                    Convert a Fritzing PCB SVG export to 3D-printable STL files (pcb board + press
                    backing plate). Export your PCB from Fritzing via <em>File → Export → as SVG</em>.
                </p>

                {/* File upload */}
                <section style={{ marginBottom: 24 }}>
                    <h3 style={{ color: '#ddd', marginBottom: 12 }}>Input file</h3>
                    <label
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 12,
                            cursor: 'pointer',
                            padding: '8px 16px',
                            background: '#2a2d35',
                            border: '1px solid #444',
                            borderRadius: 4,
                        }}
                    >
                        <input
                            type="file"
                            accept=".svg,.fz"
                            style={{ display: 'none' }}
                            onChange={handleFileChange}
                        />
                        <span style={{ color: '#aaa' }}>Choose file (.svg or .fz)</span>
                    </label>
                    {fileName && (
                        <span style={{ marginLeft: 16, color: '#4fc3f7' }}>{fileName}</span>
                    )}
                    {fileExt === '.fz' && (
                        <p style={{ color: '#f9a435', fontSize: 13, marginTop: 8 }}>
                            ⚠ .fz mode: trace positions may differ from the SVG export. Use .svg for best results.
                        </p>
                    )}
                </section>

                {/* Options form */}
                <section style={{ marginBottom: 24 }}>
                    <h3 style={{ color: '#ddd', marginBottom: 12 }}>Options</h3>
                    <div style={rowStyle}>
                        <span style={labelStyle}>Board thickness (mm)</span>
                        <input
                            type="number"
                            step="0.1"
                            value={options.boardThicknessMm}
                            onChange={e => handleOption('boardThicknessMm', parseFloat(e.target.value))}
                            style={inputStyle}
                        />
                    </div>
                    <div style={rowStyle}>
                        <span style={labelStyle}>Trace recess depth (mm)</span>
                        <input
                            type="number"
                            step="0.05"
                            value={options.traceRecessMm}
                            onChange={e => handleOption('traceRecessMm', parseFloat(e.target.value))}
                            style={inputStyle}
                        />
                    </div>
                    <div style={rowStyle}>
                        <span style={labelStyle}>Trace clearance (mm)</span>
                        <input
                            type="number"
                            step="0.05"
                            value={options.traceClearanceMm}
                            onChange={e => handleOption('traceClearanceMm', parseFloat(e.target.value))}
                            style={inputStyle}
                        />
                    </div>
                    <div style={rowStyle}>
                        <span style={labelStyle}>Bump chamfer (mm)</span>
                        <input
                            type="number"
                            step="0.05"
                            min="0"
                            value={options.bumpChamferMm}
                            onChange={e => handleOption('bumpChamferMm', parseFloat(e.target.value))}
                            style={inputStyle}
                        />
                    </div>
                    <div style={rowStyle}>
                        <span style={labelStyle}>Press thickness (mm)</span>
                        <input
                            type="number"
                            step="0.5"
                            value={options.pressThicknessMm}
                            onChange={e => handleOption('pressThicknessMm', parseFloat(e.target.value))}
                            style={inputStyle}
                        />
                    </div>
                    <div style={rowStyle}>
                        <span style={labelStyle}>Finger indent depth (mm)</span>
                        <input
                            type="number"
                            step="1"
                            min="0"
                            value={options.fingerIndentMm}
                            onChange={e => handleOption('fingerIndentMm', parseFloat(e.target.value))}
                            style={inputStyle}
                        />
                    </div>
                    <div style={rowStyle}>
                        <span style={labelStyle}>Text relief (mm)</span>
                        <input
                            type="number"
                            step="0.1"
                            min="0"
                            value={options.textReliefMm}
                            onChange={e => handleOption('textReliefMm', parseFloat(e.target.value))}
                            style={inputStyle}
                        />
                    </div>
                    {options.textReliefMm > 0 && (
                        <div style={rowStyle}>
                            <span style={labelStyle}>Font file (TTF/OTF)</span>
                            <label style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 8,
                                cursor: 'pointer',
                                padding: '4px 10px',
                                background: '#2a2d35',
                                border: '1px solid #444',
                                borderRadius: 4,
                                fontSize: 13,
                                color: '#aaa',
                            }}>
                                <input
                                    type="file"
                                    accept=".ttf,.otf,.ttc"
                                    style={{ display: 'none' }}
                                    onChange={handleFontChange}
                                />
                                {fontName ?? 'Choose font…'}
                            </label>
                            {!fontData && (
                                <span style={{ color: '#f9a435', fontSize: 12 }}>
                                    Required for text relief
                                </span>
                            )}
                        </div>
                    )}
                    <div style={rowStyle}>
                        <span style={labelStyle}>Drill diameter (mm)</span>
                        <input
                            type="number"
                            step="0.05"
                            value={options.drillDiameterMm}
                            onChange={e => handleOption('drillDiameterMm', parseFloat(e.target.value))}
                            style={inputStyle}
                        />
                    </div>
                    <div style={rowStyle}>
                        <span style={labelStyle}>Trace segments (circle quality)</span>
                        <input
                            type="number"
                            step="4"
                            min="8"
                            max="64"
                            value={options.traceSegments}
                            onChange={e => handleOption('traceSegments', parseInt(e.target.value, 10))}
                            style={inputStyle}
                        />
                    </div>
                </section>

                {/* Generate button */}
                <section style={{ marginBottom: 24 }}>
                    <button
                        onClick={generate}
                        disabled={!fileContent || generating}
                        style={{
                            padding: '10px 28px',
                            background: fileContent && !generating ? '#03A550' : '#2a2d35',
                            color: '#fff',
                            border: 'none',
                            borderRadius: 4,
                            fontSize: 16,
                            cursor: fileContent && !generating ? 'pointer' : 'not-allowed',
                        }}
                    >
                        {generating ? 'Generating…' : 'Generate STLs'}
                    </button>
                    {generating && (
                        <span style={{ marginLeft: 16, color: '#888', fontSize: 14 }}>
                            Running CSG — may take a few seconds…
                        </span>
                    )}
                </section>

                {/* Error */}
                {error && (
                    <section style={{ marginBottom: 24, padding: 12, background: '#3a1515', borderRadius: 4 }}>
                        <strong style={{ color: '#f44' }}>Error:</strong>{' '}
                        <span style={{ color: '#faa', fontSize: 14 }}>{error}</span>
                    </section>
                )}

                {/* Download links */}
                {stlOutputs && (
                    <section style={{ marginBottom: 24 }}>
                        <h3 style={{ color: '#ddd', marginBottom: 12 }}>Downloads</h3>
                        <div style={{ display: 'flex', gap: 12 }}>
                            <button
                                onClick={() => downloadStl(stlOutputs.pcb, (fileName ?? 'pcb') + '-pcb.stl')}
                                style={{
                                    padding: '8px 20px',
                                    background: '#03A550',
                                    color: '#fff',
                                    border: 'none',
                                    borderRadius: 4,
                                    cursor: 'pointer',
                                }}
                            >
                                Download PCB STL
                            </button>
                            <button
                                onClick={() => downloadStl(stlOutputs.press, (fileName ?? 'pcb') + '-press.stl')}
                                style={{
                                    padding: '8px 20px',
                                    background: '#2244aa',
                                    color: '#fff',
                                    border: 'none',
                                    borderRadius: 4,
                                    cursor: 'pointer',
                                }}
                            >
                                Download Press STL
                            </button>
                        </div>
                    </section>
                )}

                {/* STL viewer */}
                {stlOutputs && (
                    <section>
                        <h3 style={{ color: '#ddd', marginBottom: 8 }}>Preview</h3>
                        <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
                            <button
                                onClick={() => setViewerMode('pcb')}
                                style={{
                                    padding: '4px 14px',
                                    background: viewerMode === 'pcb' ? '#03A550' : '#2a2d35',
                                    color: '#fff',
                                    border: '1px solid #444',
                                    borderRadius: 4,
                                    cursor: 'pointer',
                                }}
                            >
                                PCB
                            </button>
                            <button
                                onClick={() => setViewerMode('press')}
                                style={{
                                    padding: '4px 14px',
                                    background: viewerMode === 'press' ? '#2244aa' : '#2a2d35',
                                    color: '#fff',
                                    border: '1px solid #444',
                                    borderRadius: 4,
                                    cursor: 'pointer',
                                }}
                            >
                                Press
                            </button>
                        </div>
                        <div
                            ref={canvasRef}
                            style={{
                                width: '100%',
                                height: 350,
                                borderRadius: 4,
                                overflow: 'hidden',
                                border: '1px solid #333',
                            }}
                        />
                        <p style={{ color: '#666', fontSize: 12, marginTop: 4 }}>
                            Drag to rotate · scroll to zoom
                        </p>
                    </section>
                )}
            </div>
        </Page>
    );
};

export default PCBPrinterPage;
