import { useState, useRef, useEffect, useCallback } from 'react';

export type PrivacyMaskMode = 'face-blur' | 'pixelate' | 'silhouette';

export function useVideoPrivacyMask(rawStream: MediaStream | null) {
  const [isPrivacyMaskActive, setIsPrivacyMaskActive] = useState(false);
  const [maskMode, setMaskMode] = useState<PrivacyMaskMode>('face-blur');
  const [processedStream, setProcessedStream] = useState<MediaStream | null>(rawStream);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const canvasStreamRef = useRef<MediaStream | null>(null);

  const togglePrivacyMask = useCallback(() => {
    setIsPrivacyMaskActive((prev) => !prev);
  }, []);

  useEffect(() => {
    if (!isPrivacyMaskActive || !rawStream) {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      setProcessedStream(rawStream);
      return;
    }

    const videoTrack = rawStream.getVideoTracks()[0];
    if (!videoTrack) {
      setProcessedStream(rawStream);
      return;
    }

    // Setup hidden video element to read frames from raw camera track
    if (!videoRef.current) {
      const v = document.createElement('video');
      v.muted = true;
      v.playsInline = true;
      v.autoplay = true;
      videoRef.current = v;
    }
    const video = videoRef.current;
    video.srcObject = new MediaStream([videoTrack]);
    video.play().catch(() => {});

    // Setup canvas
    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas');
    }
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    let isRendering = true;

    const renderLoop = () => {
      if (!isRendering) return;

      if (video.videoWidth > 0 && video.videoHeight > 0) {
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }

        const w = canvas.width;
        const h = canvas.height;

        // Draw original video frame
        ctx.drawImage(video, 0, 0, w, h);

        // Apply selected privacy shroud transformation
        if (maskMode === 'face-blur') {
          // Blur oval center region corresponding to facial biometric coordinates
          ctx.save();
          ctx.beginPath();
          ctx.ellipse(w / 2, h / 2 - h * 0.05, w * 0.22, h * 0.32, 0, 0, 2 * Math.PI);
          ctx.clip();
          ctx.filter = 'blur(28px)';
          ctx.drawImage(video, 0, 0, w, h);
          ctx.restore();

          // Draw subtle cybernetic perimeter grid
          ctx.strokeStyle = 'rgba(6, 182, 212, 0.4)';
          ctx.lineWidth = 2;
          ctx.setLineDash([6, 6]);
          ctx.beginPath();
          ctx.ellipse(w / 2, h / 2 - h * 0.05, w * 0.22, h * 0.32, 0, 0, 2 * Math.PI);
          ctx.stroke();
          ctx.setLineDash([]);
        } else if (maskMode === 'pixelate') {
          // Pixelate center face bounding box (anti-AI biometric recognition)
          const fx = Math.floor(w * 0.28);
          const fy = Math.floor(h * 0.15);
          const fw = Math.floor(w * 0.44);
          const fh = Math.floor(h * 0.58);
          const pixelSize = 16;

          ctx.imageSmoothingEnabled = false;
          // Downscale to small temp buffer
          ctx.drawImage(video, fx, fy, fw, fh, fx, fy, fw / pixelSize, fh / pixelSize);
          // Scale back up to create block mosaic
          ctx.drawImage(canvas, fx, fy, fw / pixelSize, fh / pixelSize, fx, fy, fw, fh);
          ctx.imageSmoothingEnabled = true;
        } else if (maskMode === 'silhouette') {
          // Full synthetic anonymity shroud (high contrast edge silhouette)
          ctx.fillStyle = '#090d16';
          ctx.fillRect(0, 0, w, h);
          ctx.save();
          ctx.beginPath();
          ctx.arc(w / 2, h / 2 - h * 0.1, w * 0.18, 0, 2 * Math.PI);
          ctx.rect(w * 0.2, h * 0.6, w * 0.6, h * 0.4);
          ctx.fillStyle = '#06b6d4';
          ctx.shadowColor = '#06b6d4';
          ctx.shadowBlur = 20;
          ctx.fill();
          ctx.restore();
        }
      }

      animFrameRef.current = requestAnimationFrame(renderLoop);
    };

    renderLoop();

    // Capture processed privacy stream
    try {
      if (!canvasStreamRef.current) {
        const stream = canvas.captureStream(30);
        // Retain original audio tracks if present
        rawStream.getAudioTracks().forEach((at) => stream.addTrack(at));
        canvasStreamRef.current = stream;
      }
      setProcessedStream(canvasStreamRef.current);
    } catch (err) {
      console.warn('Canvas captureStream not supported:', err);
      setProcessedStream(rawStream);
    }

    return () => {
      isRendering = false;
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, [isPrivacyMaskActive, rawStream, maskMode]);

  return {
    isPrivacyMaskActive,
    togglePrivacyMask,
    maskMode,
    setMaskMode,
    processedStream,
  };
}
