import React from 'react';

interface LogViewerProps {
    logData: string;
}

export const LogViewer: React.FC<LogViewerProps> = ({ logData }) => {
    if (!logData) return null;

    return (
        <div className="log-data" style={{ marginTop: '20px' }}>
            <h2>Recent Log Entries</h2>
            <pre style={{
                background: '#2a2a2a',
                color: '#e0e0e0',
                padding: '10px',
                borderRadius: '5px',
                overflow: 'auto',
                maxHeight: '300px',
                whiteSpace: 'pre-wrap',
                fontFamily: 'monospace',
                fontSize: '12px',
                textAlign: 'left'
            }}>
                {(() => {
                    try {
                        const logs = JSON.parse(logData);
                        return logs.join('\n');
                    } catch {
                        return logData;
                    }
                })()}
            </pre>
        </div>
    );
};
