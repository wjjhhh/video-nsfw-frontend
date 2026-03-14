import { useState, useRef, useEffect } from 'react';
import styles from '../styles/Home.module.css';

// Import flv.js dynamically only in browser
let flvjs: any = null;
if (typeof window !== 'undefined') {
  // Use dynamic import for flv.js
  import('flv.js').then((module) => {
    flvjs = module.default || module;
    console.log('flv.js loaded:', !!flvjs);
  }).catch((error) => {
    console.error('Error loading flv.js:', error);
  });
}

const API_BASE_URL = typeof window !== 'undefined' && window.location.hostname === 'localhost' ? 'http://localhost:3001' : '';

// Format seconds to HH:MM:SS
const formatTime = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
};

interface FrameResult {
  frameIndex: number;
  timestamp: number;
  predictions: { className: string; probability: number }[];
  isNSFW: boolean;
  frameImage?: string;
}

interface VideoAnalysisResult {
  isNSFW: boolean;
  confidence: number;
  frameResults: FrameResult[];
  totalFrames: number;
  nsfwFrames: number;
}

interface UploadResponse {
  success: boolean;
  message: string;
  result?: VideoAnalysisResult;
  error?: string;
  previewUrl?: string;
  converted?: boolean;
}

export default function Home() {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<VideoAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string>('');
  const videoRef = useRef<HTMLVideoElement>(null);

  const isBrowserSupportedFormat = (file: File): boolean => {
    const supportedFormats = [
      'video/mp4',
      'video/webm',
      'video/quicktime'
    ];
    return supportedFormats.includes(file.type);
  };

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const flvPlayerRef = useRef<any | null>(null);

  // Cleanup flv.js player
  useEffect(() => {
    return () => {
      if (flvPlayerRef.current) {
        flvPlayerRef.current.destroy();
        flvPlayerRef.current = null;
      }
    };
  }, []);

  // Setup player when videoFile changes
  useEffect(() => {
    if (videoFile) {
      if (isFlvFormat(videoFile)) {
        if (flvjs) {
          setupFlvPlayer(videoFile);
        } else {
          // If flvjs not loaded yet, try to load it
          if (typeof window !== 'undefined') {
            import('flv.js').then((module) => {
              flvjs = module.default || module;
              console.log('flv.js loaded dynamically:', !!flvjs);
              if (flvjs) {
                setupFlvPlayer(videoFile);
              } else {
                setPreviewError('FLV player failed to load');
              }
            }).catch((error) => {
              console.error('Error loading flv.js:', error);
              setPreviewError('Failed to load FLV player');
            });
          }
        }
      } else if (isBrowserSupportedFormat(videoFile)) {
        // Show local preview for browser-supported formats
        if (videoRef.current) {
          videoRef.current.src = URL.createObjectURL(videoFile);
        }
      } else {
        // For other unsupported formats
        if (videoRef.current) {
          videoRef.current.src = '';
        }
        setPreviewError('Preview not available for this format');
      }
    }
  }, [videoFile]);

  const isFlvFormat = (file: File): boolean => {
    return file.type === 'video/x-flv' || file.type === 'video/flv' || file.name.toLowerCase().endsWith('.flv');
  };

  const seekToTime = (seconds: number) => {
    if (videoRef.current) {
      if (flvPlayerRef.current && flvjs) {
        // For FLV player
        flvPlayerRef.current.currentTime = seconds;
        console.log('FLV player seek to:', seconds);
      } else {
        // For regular video element
        videoRef.current.currentTime = seconds;
        console.log('Video element seek to:', seconds);
      }
    }
  };

  const setupFlvPlayer = (file: File) => {
    console.log('Setting up FLV player...');
    console.log('flvjs available:', !!flvjs);
    if (!flvjs) {
      setPreviewError('FLV player not available');
      console.error('flvjs is null');
      return;
    }
    
    console.log('flvjs.isSupported():', flvjs.isSupported());
    if (!flvjs.isSupported()) {
      setPreviewError('FLV playback not supported in this browser');
      return;
    }

    if (videoRef.current) {
      console.log('Video element found:', videoRef.current);
      // Cleanup existing player
      if (flvPlayerRef.current) {
        console.log('Cleaning up existing player');
        flvPlayerRef.current.destroy();
        flvPlayerRef.current = null;
      }

      const url = URL.createObjectURL(file);
      console.log('Creating FLV player with URL:', url);
      
      try {
        const player = flvjs.createPlayer({
          type: 'flv',
          url: url,
          isLive: false,
          config: {
            enableWorker: true,
            enableStashBuffer: true,
            stashInitialSize: 1024 * 1024,
            lazyLoad: false,
            lazyLoadMaxDuration: 0,
            lazyLoadRecoverDuration: 0,
            deferLoadAfterSourceOpen: false,
            autoCleanupSourceBuffer: true,
            autoCleanupMaxBackwardDuration: 3,
            autoCleanupMinBackwardDuration: 2,
            fixAudioTimestampGap: true,
            accurateSeek: true,
            seekType: 'range',
            liveBufferLatencyChasing: true,
            liveBufferLatencyMaxLatency: 9,
            liveBufferLatencyMinRemain: 0.5,
            cors: true
          }
        });

        console.log('Player created:', player);
        player.attachMediaElement(videoRef.current);
        console.log('Player attached to video element');
        player.load();
        console.log('Player loaded');

        player.on(flvjs.Events.ERROR, (errType: string, errDetail: string) => {
          console.error('FLV player error:', errType, errDetail);
          setPreviewError(`Failed to play FLV video: ${errType} - ${errDetail}`);
        });

        player.on(flvjs.Events.LOAD_START, () => {
          console.log('FLV player load start');
        });

        player.on(flvjs.Events.METADATA_ARRIVED, (metadata: any) => {
          console.log('FLV metadata arrived:', metadata);
        });

        flvPlayerRef.current = player;
        setPreviewUrl(url);
        console.log('FLV player setup complete');
      } catch (error) {
        console.error('Error creating FLV player:', error);
        setPreviewError(`Error creating FLV player: ${error}`);
      }
    } else {
      console.error('Video element not found');
      setPreviewError('Video element not available');
    }
  };

  const handleVideoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.type.startsWith('video/')) {
        setVideoFile(file);
        setError(null);
        setAnalysisResult(null);
        setPreviewUrl(null);
        setPreviewError(null);

        // Cleanup existing player
        if (flvPlayerRef.current) {
          flvPlayerRef.current.destroy();
          flvPlayerRef.current = null;
        }
      } else {
        setError('Please upload a video file');
        setVideoFile(null);
      }
    }
  };

  const handleUpload = async () => {
    if (!videoFile) {
      setError('Please select a video first');
      return;
    }

    setUploading(true);
    setError(null);
    setProgress('Uploading video...');
    setAnalysisResult(null); // Clear previous results

    const formData = new FormData();
    formData.append('video', videoFile);

    try {
      // Use fetch to handle SSE
      const response = await fetch(`${API_BASE_URL}/api/video/analyze`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Server error: ' + response.statusText);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      // Process SSE events
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        
        // Process complete events
        const lines = buffer.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;

          if (line.startsWith('event:')) {
            const eventType = line.replace('event:', '').trim();
            const dataLine = lines[i + 1];
            
            if (dataLine && dataLine.startsWith('data:')) {
              const data = JSON.parse(dataLine.replace('data:', '').trim());
              
              switch (eventType) {
                case 'progress':
                  setProgress(data.message);
                  break;
                case 'frame':
                  // Update analysis result with new frame
                  setAnalysisResult(prev => {
                    if (!prev) {
                      return {
                        isNSFW: data.isNSFW,
                        confidence: 0,
                        frameResults: [data],
                        totalFrames: 5, // Expected total frames
                        nsfwFrames: data.isNSFW ? 1 : 0
                      };
                    } else {
                      const newFrameResults = [...prev.frameResults, data];
                      const newNsfwFrames = newFrameResults.filter(f => f.isNSFW).length;
                      return {
                        ...prev,
                        frameResults: newFrameResults,
                        nsfwFrames: newNsfwFrames
                      };
                    }
                  });
                  break;
                case 'complete':
                  setUploading(false);
                  setProgress('Analysis complete!');
                  setAnalysisResult(data);
                  break;
                case 'error':
                  throw new Error(data.message);
              }
              
              // Move past the data line
              i++;
            }
          }
        }

        // Keep any incomplete lines in the buffer
        const lastNewline = buffer.lastIndexOf('\n');
        if (lastNewline > -1) {
          buffer = buffer.substring(lastNewline + 1);
        }
      }

    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setError('Request timeout. Please try a smaller video.');
      } else {
        setError(err instanceof Error ? err.message : 'An error occurred during processing');
      }
      setUploading(false);
      setProgress('');
    }
  };

  const handleClearCache = async () => {
    if (!confirm('Are you sure you want to clear all cached analysis results?')) {
      return;
    }
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/video/cache`, {
        method: 'DELETE',
      });
      
      const data = await response.json();
      
      if (data.success) {
        alert(`Successfully cleared ${data.count} cached videos`);
      } else {
        alert('Failed to clear cache: ' + data.message);
      }
    } catch (error) {
      console.error('Error clearing cache:', error);
      alert('Error clearing cache: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Video NSFW Detector</h1>
        <button 
          onClick={handleClearCache}
          className={styles.clearCacheButton}
          title="Clear all cached analysis results"
        >
          🗑️ Clear Cache
        </button>
      </div>
      
      <div className={styles.uploadSection}>
        <h2>Upload Video</h2>
        <input
          type="file"
          accept="video/mp4,video/webm,video/quicktime,video/avi,video/x-msvideo,video/x-ms-wmv,video/mpeg,video/3gpp,video/x-flv,video/flv"
          onChange={handleVideoChange}
          className={styles.fileInput}
        />
        <p className={styles.supportedFormats}>
          Supported formats: MP4, WebM, MOV, AVI, WMV, MPEG, 3GP, FLV
        </p>
        
        {videoFile && (
          <div className={styles.previewSection}>
            <h3>Preview</h3>
            {previewError ? (
              <div className={styles.previewError}>
                <p>⚠️ {previewError}</p>
                <p className={styles.previewErrorHint}>You can still analyze this video without preview.</p>
              </div>
            ) : (
              <video
                ref={videoRef}
                controls
                width="400"
                className={styles.videoPreview}
                onError={(e) => {
                  console.error('Video error:', e);
                  setPreviewError('Failed to load video preview');
                }}
                onLoadedData={() => console.log('Video loaded successfully')}
              />
            )}
            <p className={styles.fileName}>{videoFile.name}</p>
            {previewUrl && videoFile && isFlvFormat(videoFile) && (
              <p className={styles.convertedBadge}>✓ FLV Player Ready</p>
            )}
          </div>
        )}

        <button
          onClick={handleUpload}
          disabled={!videoFile || uploading || analyzing}
          className={styles.uploadButton}
        >
          {uploading ? 'Uploading...' : analyzing ? 'Analyzing...' : 'Upload & Analyze'}
        </button>

        {(uploading || analyzing) && progress && (
          <div className={styles.progressSection}>
            <div className={styles.progressBar}>
              <div className={styles.progressFill} />
            </div>
            <p className={styles.progressText}>{progress}</p>
            <p className={styles.progressHint}>This may take 10-30 seconds depending on video size</p>
          </div>
        )}
      </div>

      {error && (
        <div className={styles.errorMessage}>
          {error}
        </div>
      )}

      {analysisResult && (
        <div className={styles.resultSection}>
          <h2>Analysis Result</h2>
          <div className={styles.resultCard}>
            <p className={styles.resultItem}>
              <strong>Status:</strong>{' '}
              <span className={analysisResult.isNSFW ? styles.nsfw : styles.safe}>
                {analysisResult.isNSFW ? 'NSFW Detected' : 'Safe'}
              </span>
            </p>
            <p className={styles.resultItem}>
              <strong>Confidence:</strong> {analysisResult.confidence.toFixed(2)}%
            </p>
            <p className={styles.resultItem}>
              <strong>Frames Analyzed:</strong> {analysisResult.totalFrames}
            </p>
            <p className={styles.resultItem}>
              <strong>NSFW Frames:</strong> {analysisResult.nsfwFrames}
            </p>
          </div>
          <div className={`${styles.resultMessage} ${analysisResult.isNSFW ? styles.nsfwMessage : styles.safeMessage}`}>
            {analysisResult.isNSFW 
              ? `This video contains potentially sensitive content in ${analysisResult.nsfwFrames} frame(s).` 
              : 'This video appears to be safe.'}
          </div>

          {analysisResult.isNSFW && (
            <div className={styles.nsfwDetails}>
              <h3>⚠️ Detection Details</h3>
              <p className={styles.nsfwExplanation}>
                The following content types were detected:
              </p>
              <ul className={styles.nsfwList}>
                <li><strong>Porn</strong> - Adult/sexual content</li>
                <li><strong>Sexy</strong> - Suggestive/revealing content</li>
                <li><strong>Hentai</strong> - Anime/manga adult content</li>
              </ul>
              <p className={styles.nsfwNote}>
                Detection is based on AI analysis of video frames. Results may not be 100% accurate.
              </p>
            </div>
          )}
          
          {analysisResult.frameResults.length > 0 && (
            <div className={styles.frameDetails}>
              <h3>Frame Details</h3>
              <div className={styles.frameGrid}>
                {analysisResult.frameResults.map((frame) => (
                  <div 
                    key={frame.frameIndex} 
                    className={`${styles.frameCard} ${frame.isNSFW ? styles.nsfwCard : styles.safeCard}`}
                    onClick={() => seekToTime(frame.timestamp)}
                    style={{ cursor: 'pointer' }}
                  >
                    {frame.frameImage ? (
                      <img src={frame.frameImage} alt={`Frame ${frame.frameIndex + 1}`} className={styles.frameImage} />
                    ) : (
                      <div className={styles.framePlaceholder}>No Image</div>
                    )}
                    <div className={styles.frameInfo}>
                      <div className={styles.frameHeader}>
                        <span className={styles.frameIndex}>Frame #{frame.frameIndex + 1}</span>
                        <span className={styles.frameTime}>@ {formatTime(frame.timestamp)}</span>
                      </div>
                      <span className={`${styles.frameStatus} ${frame.isNSFW ? styles.nsfwStatus : styles.safeStatus}`}>
                        {frame.isNSFW ? '⚠️ NSFW' : '✓ Safe'}
                      </span>
                      {frame.predictions && frame.predictions.length > 0 && (
                        <div className={styles.predictions}>
                          {frame.predictions.slice(0, 3).map((pred, idx) => (
                            <div key={idx} className={styles.predictionItem}>
                              <span className={styles.predictionClass}>{pred.className}</span>
                              <div className={styles.predictionBar}>
                                <div 
                                  className={`${styles.predictionFill} ${
                                    ['Porn', 'Sexy', 'Hentai'].includes(pred.className) ? styles.nsfwBar : styles.safeBar
                                  }`}
                                  style={{ width: `${pred.probability * 100}%` }}
                                />
                              </div>
                              <span className={styles.predictionValue}>{(pred.probability * 100).toFixed(1)}%</span>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className={styles.frameAction}>
                        <span className={styles.frameActionText}>Click to jump to this time</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}