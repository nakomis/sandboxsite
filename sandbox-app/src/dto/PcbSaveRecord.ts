import type { UIOptions } from '../components/pages/PCBPrinterPage';

export type { UIOptions };

export interface PcbSaveRecord {
    id: string;              // UUID v4
    filename: string;        // SVG filename without extension
    svgHash: string;         // SHA-256 hex of original SVG content
    majorVersion: number;
    minorVersion: number;
    svgKey: string;          // S3: svg/{hash}.svg (versioned SVG content)
    pcbStlKey: string;       // S3: stl/{hash}-pcb.stl
    pressStlKey: string;     // S3: stl/{hash}-press.stl
    options: UIOptions;
    timestamp: string;       // ISO 8601
    sandboxVersion: string;
    pcbprinterVersion: string;
    ttl: number;             // Unix epoch, now + 30 days
}
