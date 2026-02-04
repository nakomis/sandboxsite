import React from 'react';

interface ImageProgress {
    current: number;
    total: number;
}

interface ImageGalleryProps {
    imageList: string[];
    selectedImage: string;
    onImageSelect: (event: React.ChangeEvent<HTMLSelectElement>) => void;
    isLoadingImage: boolean;
    imageProgress: ImageProgress | null;
    currentImage: string | null;
    currentMetadata: string | null;
}

export const ImageGallery: React.FC<ImageGalleryProps> = ({
    imageList,
    selectedImage,
    onImageSelect,
    isLoadingImage,
    imageProgress,
    currentImage,
    currentMetadata
}) => {
    if (imageList.length === 0) return null;

    const catNames = ['Boots', 'Chi', 'Kappa', 'Mu', 'Tau', 'NoCat'];

    return (
        <div className="image-section" style={{ marginTop: '20px' }}>
            <h2>Device Images</h2>
            <div style={{ marginBottom: '15px' }}>
                <label htmlFor="image-select" style={{ marginRight: '10px' }}>
                    <strong>Select Image:</strong>
                </label>
                <select
                    id="image-select"
                    value={selectedImage}
                    onChange={onImageSelect}
                    disabled={isLoadingImage}
                    style={{
                        padding: '8px 12px',
                        borderRadius: '4px',
                        border: '1px solid #444',
                        minWidth: '300px',
                        backgroundColor: '#282c34',
                        color: '#ffffff'
                    }}
                >
                    <option value="">-- Select an image --</option>
                    {[...imageList].reverse().map((img) => (
                        <option key={img} value={img}>
                            {img}
                        </option>
                    ))}
                </select>
                <span style={{ marginLeft: '10px', color: '#666' }}>
                    ({imageList.length} images available)
                </span>
            </div>

            {/* Loading indicator */}
            {isLoadingImage && imageProgress && (
                <div style={{ marginBottom: '15px' }}>
                    <p>Loading image... ({imageProgress.current}/{imageProgress.total} chunks)</p>
                    <div style={{
                        width: '100%',
                        height: '20px',
                        backgroundColor: '#e0e0e0',
                        borderRadius: '10px',
                        overflow: 'hidden'
                    }}>
                        <div style={{
                            width: `${imageProgress.total > 0 ? (imageProgress.current / imageProgress.total) * 100 : 0}%`,
                            height: '100%',
                            backgroundColor: '#4CAF50',
                            transition: 'width 0.2s'
                        }} />
                    </div>
                </div>
            )}

            {/* Image and metadata display */}
            {currentImage && (
                <div style={{
                    display: 'flex',
                    gap: '20px',
                    alignItems: 'flex-start'
                }}>
                    {/* Image panel */}
                    <div style={{
                        flex: '1',
                        border: '1px solid #444',
                        borderRadius: '8px',
                        padding: '10px',
                        backgroundColor: '#282c34'
                    }}>
                        <img
                            src={currentImage}
                            alt={selectedImage}
                            style={{
                                maxWidth: '100%',
                                maxHeight: '500px',
                                display: 'block',
                                margin: '0 auto',
                                borderRadius: '4px'
                            }}
                        />
                        <p style={{
                            textAlign: 'center',
                            marginTop: '10px',
                            color: '#e0e0e0',
                            fontSize: '14px'
                        }}>
                            {selectedImage}
                        </p>
                    </div>

                    {/* Metadata panel */}
                    <div style={{
                        flex: '0 0 300px',
                        border: '1px solid #444',
                        borderRadius: '8px',
                        padding: '15px',
                        backgroundColor: '#282c34'
                    }}>
                        <h4 style={{ marginTop: 0, marginBottom: '15px', color: '#e0e0e0' }}>
                            AI Inference Result
                        </h4>
                        {currentMetadata ? (
                            (() => {
                                try {
                                    const data = JSON.parse(currentMetadata);
                                    return (
                                        <div>
                                            {data.mostLikelyCat && (
                                                <div style={{
                                                    marginBottom: '15px',
                                                    padding: '10px',
                                                    backgroundColor: '#1a1a2e',
                                                    borderRadius: '6px'
                                                }}>
                                                    <p style={{ margin: '0 0 5px 0', color: '#4CAF50', fontWeight: 'bold', fontSize: '18px' }}>
                                                        {data.mostLikelyCat.name}
                                                    </p>
                                                    <p style={{ margin: 0, color: '#aaa', fontSize: '14px' }}>
                                                        Confidence: {(data.mostLikelyCat.confidence * 100).toFixed(1)}%
                                                    </p>
                                                </div>
                                            )}
                                            {data.data?.probabilities && (
                                                <div>
                                                    <p style={{ color: '#888', fontSize: '12px', marginBottom: '8px' }}>
                                                        All Probabilities:
                                                    </p>
                                                    {data.data.probabilities.map((prob: number, i: number) => (
                                                        <div key={catNames[i]} style={{
                                                            display: 'flex',
                                                            justifyContent: 'space-between',
                                                            marginBottom: '4px',
                                                            padding: '4px 8px',
                                                            backgroundColor: i === data.mostLikelyCat?.index ? '#2d3748' : 'transparent',
                                                            borderRadius: '4px'
                                                        }}>
                                                            <span style={{ color: '#e0e0e0', fontSize: '13px' }}>
                                                                {catNames[i]}
                                                            </span>
                                                            <span style={{ color: '#aaa', fontSize: '13px' }}>
                                                                {(prob * 100).toFixed(1)}%
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    );
                                } catch {
                                    return (
                                        <pre style={{
                                            color: '#e0e0e0',
                                            fontSize: '12px',
                                            whiteSpace: 'pre-wrap',
                                            wordBreak: 'break-word',
                                            margin: 0
                                        }}>
                                            {currentMetadata}
                                        </pre>
                                    );
                                }
                            })()
                        ) : (
                            <p style={{ color: '#666', fontStyle: 'italic', margin: 0 }}>
                                {isLoadingImage ? 'Loading...' : 'No metadata available'}
                            </p>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
