import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  X,
  Pen,
  Square,
  Circle,
  Eraser,
  Trash2,
  Download,
  Lock,
  WifiOff,
  Layers,
} from 'lucide-react';
import { CRDTWhiteboardDoc, WhiteboardDelta } from '@aegis/crypto';

export interface StrokePoint {
  x: number;
  y: number;
}

export interface WhiteboardStroke {
  id: string;
  tool: 'pen' | 'line' | 'rect' | 'circle' | 'eraser' | 'arrow';
  color: string;
  width: number;
  points: StrokePoint[];
  delta?: WhiteboardDelta;
}

interface WhiteboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBroadcastStroke: (stroke: WhiteboardStroke) => void;
  incomingStroke: WhiteboardStroke | null;
  isDataChannelOpen: boolean;
}

const COLORS = ['#06b6d4', '#10b981', '#f59e0b', '#f43f5e', '#a855f7', '#ffffff'];
const WIDTHS = [2, 4, 8, 14];

export const WhiteboardModal: React.FC<WhiteboardModalProps> = ({
  isOpen,
  onClose,
  onBroadcastStroke,
  incomingStroke,
  isDataChannelOpen,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [currentTool, setCurrentTool] = useState<'pen' | 'line' | 'rect' | 'circle' | 'eraser'>('pen');
  const [currentColor, setCurrentColor] = useState<string>('#06b6d4');
  const [currentWidth, setCurrentWidth] = useState<number>(4);
  const [isDrawing, setIsDrawing] = useState(false);

  const crdtDocRef = useRef<CRDTWhiteboardDoc>(new CRDTWhiteboardDoc(`peer-${Date.now().toString(36)}`));
  const strokesRef = useRef<WhiteboardStroke[]>([]);
  const currentPointsRef = useRef<StrokePoint[]>([]);

  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#090d16'; // Deep cybersecurity dark backdrop
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw grid lines
    ctx.strokeStyle = '#1e293b22';
    ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    // Render all committed strokes
    for (const stroke of strokesRef.current) {
      renderSingleStroke(ctx, stroke);
    }
  }, []);

  const renderSingleStroke = (ctx: CanvasRenderingContext2D, stroke: WhiteboardStroke) => {
    if (stroke.points.length === 0) return;

    ctx.save();
    ctx.strokeStyle = stroke.tool === 'eraser' ? '#090d16' : stroke.color;
    ctx.fillStyle = stroke.tool === 'eraser' ? '#090d16' : stroke.color;
    ctx.lineWidth = stroke.tool === 'eraser' ? stroke.width * 2.5 : stroke.width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const p0 = stroke.points[0];

    if (stroke.tool === 'pen' || stroke.tool === 'eraser') {
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
      ctx.stroke();
    } else if (stroke.tool === 'line') {
      const pLast = stroke.points[stroke.points.length - 1];
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(pLast.x, pLast.y);
      ctx.stroke();
    } else if (stroke.tool === 'rect') {
      const pLast = stroke.points[stroke.points.length - 1];
      const w = pLast.x - p0.x;
      const h = pLast.y - p0.y;
      ctx.strokeRect(p0.x, p0.y, w, h);
    } else if (stroke.tool === 'circle') {
      const pLast = stroke.points[stroke.points.length - 1];
      const radius = Math.hypot(pLast.x - p0.x, pLast.y - p0.y);
      ctx.beginPath();
      ctx.arc(p0.x, p0.y, radius, 0, 2 * Math.PI);
      ctx.stroke();
    }

    ctx.restore();
  };

  // Adjust canvas resolution on mount/resize
  useEffect(() => {
    if (!isOpen) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = canvas.parentElement?.clientWidth || 900;
    canvas.height = canvas.parentElement?.clientHeight || 600;
    redrawCanvas();
  }, [isOpen, redrawCanvas]);

  // Handle incoming remote stroke with CRDT resolution
  useEffect(() => {
    if (!incomingStroke) return;

    if (incomingStroke.points.length === 0 && incomingStroke.id.startsWith('clear-')) {
      crdtDocRef.current.clear();
      strokesRef.current = [];
      redrawCanvas();
      return;
    }

    if (incomingStroke.delta) {
      crdtDocRef.current.mergeDelta(incomingStroke.delta);
    } else {
      const crdtTool = incomingStroke.tool === 'line' ? 'pen' : incomingStroke.tool;
      crdtDocRef.current.addStroke({
        id: incomingStroke.id,
        type: crdtTool,
        points: incomingStroke.points,
        color: incomingStroke.color,
        strokeWidth: incomingStroke.width,
      });
    }

    strokesRef.current = crdtDocRef.current.getActiveElements().map((el) => ({
      id: el.id,
      tool: el.type,
      color: el.color,
      width: el.strokeWidth,
      points: el.points,
    }));

    redrawCanvas();
  }, [incomingStroke, redrawCanvas]);

  // Keyboard shortcut listener (ESC to close)
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement>): StrokePoint => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDrawing(true);
    const pt = getCanvasCoords(e);
    currentPointsRef.current = [pt];
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const pt = getCanvasCoords(e);
    currentPointsRef.current.push(pt);

    if (currentTool === 'pen' || currentTool === 'eraser') {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const pts = currentPointsRef.current;
      if (pts.length >= 2) {
        ctx.save();
        ctx.strokeStyle = currentTool === 'eraser' ? '#090d16' : currentColor;
        ctx.lineWidth = currentTool === 'eraser' ? currentWidth * 2.5 : currentWidth;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(pts[pts.length - 2].x, pts[pts.length - 2].y);
        ctx.lineTo(pt.x, pt.y);
        ctx.stroke();
        ctx.restore();
      }
    } else {
      // Shape preview: redraw canvas then draw live shape preview
      redrawCanvas();
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        renderSingleStroke(ctx, {
          id: 'preview',
          tool: currentTool,
          color: currentColor,
          width: currentWidth,
          points: currentPointsRef.current,
        });
      }
    }
  };

  const handleMouseUp = () => {
    if (!isDrawing) return;
    setIsDrawing(false);

    if (currentPointsRef.current.length > 0) {
      const strokeId = `stroke-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const crdtTool = currentTool === 'line' ? 'pen' : currentTool;

      const { delta } = crdtDocRef.current.addStroke({
        id: strokeId,
        type: crdtTool,
        points: [...currentPointsRef.current],
        color: currentColor,
        strokeWidth: currentWidth,
      });

      const stroke: WhiteboardStroke = {
        id: strokeId,
        tool: currentTool,
        color: currentColor,
        width: currentWidth,
        points: [...currentPointsRef.current],
        delta,
      };

      strokesRef.current.push(stroke);
      onBroadcastStroke(stroke);
      redrawCanvas();
    }
    currentPointsRef.current = [];
  };

  const handleClear = () => {
    const clearDelta = crdtDocRef.current.clear();
    strokesRef.current = [];
    redrawCanvas();
    onBroadcastStroke({
      id: `clear-${Date.now()}`,
      tool: 'eraser',
      color: '#000000',
      width: 0,
      points: [],
      delta: clearDelta,
    });
  };

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `aegis-whiteboard-${Date.now()}.png`;
    a.click();
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Zero-Knowledge Encrypted Whiteboard"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-dark-950/80 backdrop-blur-md animate-fade-in"
    >
      <div className="relative w-full max-w-5xl h-[85vh] bg-dark-900 border border-dark-700 rounded-3xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header Bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-dark-800 bg-dark-900/90">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-cyber-cyan/10 border border-cyber-cyan/30 text-cyber-cyan">
              <Pen className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
                <span>Encrypted Vector Whiteboard</span>
                <span className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyber-emerald/10 border border-cyber-emerald/30 text-cyber-emerald">
                  <Lock className="w-3 h-3" /> P2P DataChannel (AES-256-GCM)
                </span>
                <span className="hidden sm:flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyber-cyan/10 border border-cyber-cyan/30 text-cyber-cyan">
                  <Layers className="w-3 h-3" /> CRDT Vector Clock
                </span>
              </h2>
              <p className="text-xs text-slate-400">Zero server storage • Vector deltas live only in ephemeral RAM</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {!isDataChannelOpen && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyber-amber/10 border border-cyber-amber/30 text-cyber-amber text-xs font-mono">
                <WifiOff className="w-4 h-4" />
                <span>P2P Channel Connecting...</span>
              </div>
            )}
            <button
              onClick={handleDownload}
              aria-label="Export canvas as PNG"
              title="Download Snapshot (PNG)"
              className="p-2.5 rounded-xl bg-dark-850 hover:bg-dark-800 border border-dark-700 text-slate-300 hover:text-slate-100 transition-colors"
            >
              <Download className="w-4 h-4" />
            </button>
            <button
              onClick={handleClear}
              aria-label="Clear whiteboard"
              title="Clear Canvas"
              className="p-2.5 rounded-xl bg-dark-850 hover:bg-rose-900/30 border border-dark-700 hover:border-rose-500/40 text-slate-400 hover:text-rose-400 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              aria-label="Close Whiteboard Modal"
              className="p-2.5 rounded-xl bg-dark-850 hover:bg-dark-800 border border-dark-700 text-slate-400 hover:text-slate-200 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Canvas Body & Floating Tool Palette */}
        <div className="relative flex-1 bg-dark-950 overflow-hidden select-none">
          <canvas
            ref={canvasRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            className="w-full h-full cursor-crosshair touch-none"
          />

          {/* Floating Dock Palette */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2.5 px-4 py-2 bg-dark-900/90 border border-dark-750 backdrop-blur-xl rounded-2xl shadow-2xl z-10">
            {/* Tools */}
            <button
              onClick={() => setCurrentTool('pen')}
              aria-label="Pen tool"
              className={`p-2 rounded-xl transition-colors ${currentTool === 'pen' ? 'bg-cyber-cyan/20 border border-cyber-cyan text-cyber-cyan' : 'text-slate-400 hover:text-slate-200'}`}
            >
              <Pen className="w-4 h-4" />
            </button>
            <button
              onClick={() => setCurrentTool('line')}
              aria-label="Line tool"
              className={`p-2 rounded-xl transition-colors ${currentTool === 'line' ? 'bg-cyber-cyan/20 border border-cyber-cyan text-cyber-cyan' : 'text-slate-400 hover:text-slate-200'}`}
            >
              <span className="text-xs font-mono font-bold">╱</span>
            </button>
            <button
              onClick={() => setCurrentTool('rect')}
              aria-label="Rectangle tool"
              className={`p-2 rounded-xl transition-colors ${currentTool === 'rect' ? 'bg-cyber-cyan/20 border border-cyber-cyan text-cyber-cyan' : 'text-slate-400 hover:text-slate-200'}`}
            >
              <Square className="w-4 h-4" />
            </button>
            <button
              onClick={() => setCurrentTool('circle')}
              aria-label="Circle tool"
              className={`p-2 rounded-xl transition-colors ${currentTool === 'circle' ? 'bg-cyber-cyan/20 border border-cyber-cyan text-cyber-cyan' : 'text-slate-400 hover:text-slate-200'}`}
            >
              <Circle className="w-4 h-4" />
            </button>
            <button
              onClick={() => setCurrentTool('eraser')}
              aria-label="Eraser tool"
              className={`p-2 rounded-xl transition-colors ${currentTool === 'eraser' ? 'bg-cyber-cyan/20 border border-cyber-cyan text-cyber-cyan' : 'text-slate-400 hover:text-slate-200'}`}
            >
              <Eraser className="w-4 h-4" />
            </button>

            <div className="h-5 w-px bg-dark-750 my-auto" />

            {/* Colors */}
            <div className="flex items-center gap-1.5">
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setCurrentColor(c)}
                  aria-label={`Select color ${c}`}
                  style={{ backgroundColor: c }}
                  className={`w-5 h-5 rounded-full transition-transform ${currentColor === c ? 'scale-125 ring-2 ring-white' : 'opacity-75 hover:opacity-100'}`}
                />
              ))}
            </div>

            <div className="h-5 w-px bg-dark-750 my-auto" />

            {/* Widths */}
            <div className="flex items-center gap-1.5">
              {WIDTHS.map((w) => (
                <button
                  key={w}
                  onClick={() => setCurrentWidth(w)}
                  aria-label={`Stroke width ${w}px`}
                  className={`w-6 h-6 rounded-lg flex items-center justify-center transition-colors ${currentWidth === w ? 'bg-dark-750 text-cyber-cyan font-bold' : 'text-slate-500 hover:text-slate-300'} text-xs font-mono`}
                >
                  {w}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
