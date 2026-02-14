
import React, { useState, useRef, useEffect } from 'react';
import { X, Check, Sparkles, ZoomIn, Loader2, Image as ImageIcon, Brush, MousePointer2, Palette, Eraser, PaintBucket, Shield, RotateCcw, Grid3X3, Undo, Scan } from 'lucide-react';

interface FaceBox {
  ymin: number;
  xmin: number;
  ymax: number;
  xmax: number;
}

interface ImageEditModalProps {
  isOpen: boolean;
  imageSource: File | string | null;
  onClose: () => void;
  onSave: (editedImage: Blob) => void;
  onAiEdit: (file: File, prompt: string) => Promise<string>; // Returns base64 or url
  onDetectFaces: (file: File) => Promise<FaceBox[]>;
}

type ToolMode = 'move' | 'brush' | 'bucket' | 'mask' | 'eraser';

export const ImageEditModal: React.FC<ImageEditModalProps> = ({
  isOpen,
  imageSource,
  onClose,
  onSave,
  onAiEdit,
  onDetectFaces
}) => {
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  
  // Transform State
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [showGrid, setShowGrid] = useState(true);
  const [baseScale, setBaseScale] = useState(1); // Ratio of Screen Pixels to Image Pixels
  
  // Interaction State
  const [mode, setMode] = useState<ToolMode>('move');
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false); // To track if drawing occurred during click

  // History State for Undo
  const [history, setHistory] = useState<{drawing: ImageData, mask: ImageData}[]>([]);
  const [historyStep, setHistoryStep] = useState(-1);

  // Tool Settings
  const [brushColor, setBrushColor] = useState('#ff0055');
  const [brushSize, setBrushSize] = useState(20);
  
  // AI State
  const [aiPrompt, setAiPrompt] = useState("neon cyber city background");
  
  // Refs
  const imgRef = useRef<HTMLImageElement>(null);
  const drawingCanvasRef = useRef<HTMLCanvasElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement>(null); // Layer for "Preserving"
  const containerRef = useRef<HTMLDivElement>(null);

  // Viewport Size (The fixed square crop area in UI pixels)
  const VIEWPORT_SIZE = 500;

  // Initialize
  useEffect(() => {
    if (imageSource) {
      let url = '';
      let isObjectUrl = false;

      if (imageSource instanceof File) {
          url = URL.createObjectURL(imageSource);
          isObjectUrl = true;
      } else {
          url = imageSource;
      }
      
      setImgSrc(url);
      setZoom(1);
      setPan({ x: 0, y: 0 });
      setMode('move');
      setBaseScale(1); 
      // Reset canvases & history
      clearCanvas(drawingCanvasRef.current);
      clearCanvas(maskCanvasRef.current);
      setHistory([]);
      setHistoryStep(-1);
      
      return () => {
          if (isObjectUrl) URL.revokeObjectURL(url);
      };
    }
  }, [imageSource]);

  const clearCanvas = (canvas: HTMLCanvasElement | null) => {
    if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  const saveHistory = () => {
    if (!drawingCanvasRef.current || !maskCanvasRef.current) return;
    
    const dCtx = drawingCanvasRef.current.getContext('2d');
    const mCtx = maskCanvasRef.current.getContext('2d');
    
    if (!dCtx || !mCtx) return;

    const w = drawingCanvasRef.current.width;
    const h = drawingCanvasRef.current.height;

    const drawingData = dCtx.getImageData(0, 0, w, h);
    const maskData = mCtx.getImageData(0, 0, w, h);

    // If we are in the middle of history (undone steps), discard future steps
    const newHistory = history.slice(0, historyStep + 1);
    newHistory.push({ drawing: drawingData, mask: maskData });
    
    // Limit history to save memory
    if (newHistory.length > 20) newHistory.shift();
    
    setHistory(newHistory);
    setHistoryStep(newHistory.length - 1);
  };

  const handleUndo = () => {
    if (historyStep > 0) {
        const prevStep = historyStep - 1;
        const state = history[prevStep];
        
        if (drawingCanvasRef.current && maskCanvasRef.current) {
             const dCtx = drawingCanvasRef.current.getContext('2d');
             const mCtx = maskCanvasRef.current.getContext('2d');
             if (dCtx) dCtx.putImageData(state.drawing, 0, 0);
             if (mCtx) mCtx.putImageData(state.mask, 0, 0);
        }
        setHistoryStep(prevStep);
    } else if (historyStep === 0) {
        // Clear everything if undoing the first step
        clearCanvas(drawingCanvasRef.current);
        clearCanvas(maskCanvasRef.current);
        setHistoryStep(-1);
    }
  };

  // Resize canvases to match image natural size
  const handleImageLoad = () => {
    if (imgRef.current) {
      const { naturalWidth, naturalHeight } = imgRef.current;
      
      // Calculate scale factor: Screen Pixels / Image Pixels
      // The image is rendered with height = VIEWPORT_SIZE (500px)
      const scale = VIEWPORT_SIZE / naturalHeight;
      setBaseScale(scale);

      if (drawingCanvasRef.current) {
        drawingCanvasRef.current.width = naturalWidth;
        drawingCanvasRef.current.height = naturalHeight;
      }
      if (maskCanvasRef.current) {
        maskCanvasRef.current.width = naturalWidth;
        maskCanvasRef.current.height = naturalHeight;
      }

      // Save initial state (blank) to history
      saveHistory();
    }
  };

  const handleFaceDetect = async () => {
    if (!imgRef.current || !maskCanvasRef.current) return;
    
    setIsProcessing(true);
    let facesFound = false;
    let facesData: any[] = [];

    // 1. Try Native System API
    try {
      // @ts-ignore
      if (window.FaceDetector) {
         // @ts-ignore
         const faceDetector = new window.FaceDetector();
         // @ts-ignore
         const faces = await faceDetector.detect(imgRef.current);
         if (faces.length > 0) {
            facesData = faces.map((f: any) => ({
              type: 'system',
              box: f.boundingBox
            }));
            facesFound = true;
         }
      }
    } catch (e) {
      console.warn("System Face Detection failed, falling back to AI.", e);
    }

    // 2. Fallback to AI if system failed or found nothing
    if (!facesFound) {
       try {
          // We need a File object. If source is string (url), fetch it.
          let fileToUpload: File;
          if (imageSource instanceof File) {
             fileToUpload = imageSource;
          } else if (typeof imageSource === 'string') {
             const res = await fetch(imageSource);
             const blob = await res.blob();
             fileToUpload = new File([blob], "image.png", { type: blob.type });
          } else {
            throw new Error("Invalid image source");
          }

          const aiFaces = await onDetectFaces(fileToUpload);
          if (aiFaces.length > 0) {
             // Convert normalized coordinates (0-1) to pixel coordinates
             const { naturalWidth, naturalHeight } = imgRef.current;
             facesData = aiFaces.map(f => ({
                type: 'ai',
                box: {
                   left: f.xmin * naturalWidth,
                   top: f.ymin * naturalHeight,
                   width: (f.xmax - f.xmin) * naturalWidth,
                   height: (f.ymax - f.ymin) * naturalHeight
                }
             }));
             facesFound = true;
          }

       } catch (e) {
         console.error("AI Face Detection failed", e);
       }
    }

    // 3. Draw Results
    const ctx = maskCanvasRef.current.getContext('2d');
    if (ctx && facesFound) {
         ctx.fillStyle = 'rgba(0, 255, 100, 0.5)'; // Mask color
         facesData.forEach((face) => {
             const { width, height, top, left } = face.box;
             
             // Draw oval/rounded rect for face
             ctx.beginPath();
             
             // Expand slightly for better coverage
             const paddingX = width * 0.1;
             const paddingY = height * 0.2; // more padding on top for hair
             
             const centerX = left + width / 2;
             const centerY = top + height / 2 - (height * 0.05); // shift up slightly
             const radiusX = (width / 2) + paddingX;
             const radiusY = (height / 2) + paddingY;

             ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, 2 * Math.PI);
             ctx.fill();
         });
         saveHistory();
    } else if (!facesFound) {
      alert("No faces detected by System or AI.");
    }
    
    setIsProcessing(false);
  };

  if (!isOpen || !imageSource) return null;

  // --- Coordinate Mapping ---
  const getPointerPos = (e: React.MouseEvent | React.TouchEvent) => {
    if ('touches' in e) {
      return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    return { x: (e as React.MouseEvent).clientX, y: (e as React.MouseEvent).clientY };
  };

  const getCanvasCoordinates = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const pos = getPointerPos(e);
    // Map screen coordinates (zoomed/panned) back to internal resolution
    const x = (pos.x - rect.left) * (canvas.width / rect.width);
    const y = (pos.y - rect.top) * (canvas.height / rect.height);
    return { x, y };
  };

  // --- Interaction Handlers ---

  const handleMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
    if (mode === 'move') {
      setIsDragging(true);
      const pos = getPointerPos(e);
      setDragStart({ x: pos.x - pan.x, y: pos.y - pan.y });
    } else if (mode === 'bucket') {
       handleBucketFill(e);
       saveHistory(); // Save after fill
    } else {
      // Brush, Eraser, Mask
      setIsDrawing(true);
      setHasInteracted(true); // Mark that we started drawing
      draw(e);
    }
  };

  const handleMouseMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (mode === 'move' && isDragging) {
      const pos = getPointerPos(e);
      setPan({
        x: pos.x - dragStart.x,
        y: pos.y - dragStart.y
      });
    } else if (isDrawing && mode !== 'move' && mode !== 'bucket') {
      draw(e);
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    if (isDrawing && hasInteracted) {
        saveHistory(); // Save state after drawing stroke
    }
    setIsDrawing(false);
    setHasInteracted(false);
    
    // Reset paths
    const ctxDraw = drawingCanvasRef.current?.getContext('2d');
    if (ctxDraw) ctxDraw.beginPath();
    const ctxMask = maskCanvasRef.current?.getContext('2d');
    if (ctxMask) ctxMask.beginPath();
  };

  // --- Drawing Logic ---

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    let canvas = drawingCanvasRef.current;
    let color = brushColor;
    let compositeOp: GlobalCompositeOperation = 'source-over';

    // Route to correct canvas based on mode
    if (mode === 'mask') {
        canvas = maskCanvasRef.current;
        color = 'rgba(0, 255, 100, 0.5)'; // Semi-transparent green for mask
    } else if (mode === 'eraser') {
        // Eraser only affects drawing layer
        compositeOp = 'destination-out';
    }

    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { x, y } = getCanvasCoordinates(e, canvas);

    ctx.lineWidth = brushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = color;
    ctx.globalCompositeOperation = compositeOp;

    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.globalCompositeOperation = 'source-over'; // Reset
  };

  // --- Bucket Fill Algorithm (Smart Fill) ---
  const handleBucketFill = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawingCanvasRef.current || !maskCanvasRef.current) return;
    
    const canvas = drawingCanvasRef.current;
    const maskCanvas = maskCanvasRef.current;
    const ctx = canvas.getContext('2d');
    const maskCtx = maskCanvas.getContext('2d');
    if (!ctx || !maskCtx) return;

    const { x, y } = getCanvasCoordinates(e, canvas);
    const startX = Math.floor(x);
    const startY = Math.floor(y);

    const width = canvas.width;
    const height = canvas.height;

    // Get Pixel Data
    const imgData = ctx.getImageData(0, 0, width, height);
    const maskData = maskCtx.getImageData(0, 0, width, height);
    const pixels = imgData.data;
    const maskPixels = maskData.data;

    // Parse fill color
    const hex = brushColor.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    const a = 255;

    // Get start color
    const startPos = (startY * width + startX) * 4;
    const startR = pixels[startPos];
    const startG = pixels[startPos + 1];
    const startB = pixels[startPos + 2];
    const startA = pixels[startPos + 3];

    // Don't fill if clicking exact same color
    if (startR === r && startG === g && startB === b && startA === a) return;

    // Stack based flood fill
    const stack = [[startX, startY]];
    
    while (stack.length) {
        const [cx, cy] = stack.pop()!;
        const pos = (cy * width + cx) * 4;

        // Bounds Check
        if (cx < 0 || cx >= width || cy < 0 || cy >= height) continue;

        // Mask Check (If alpha > 0 in mask layer, it's a wall)
        if (maskPixels[pos + 3] > 10) continue; 

        // Color Match Check
        if (pixels[pos] === startR && pixels[pos + 1] === startG && pixels[pos + 2] === startB && pixels[pos + 3] === startA) {
            // Fill
            pixels[pos] = r;
            pixels[pos + 1] = g;
            pixels[pos + 2] = b;
            pixels[pos + 3] = a;

            // Push neighbors
            stack.push([cx + 1, cy]);
            stack.push([cx - 1, cy]);
            stack.push([cx, cy + 1]);
            stack.push([cx, cy - 1]);
        }
    }

    ctx.putImageData(imgData, 0, 0);
  };

  // --- Save Logic ---
  const handleSave = () => {
    if (!imgRef.current) return;

    // High quality output size
    const outputSize = 1024; 
    const canvas = document.createElement('canvas');
    canvas.width = outputSize;
    canvas.height = outputSize;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 1. Fill black background
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, outputSize, outputSize);

    // 2. Setup Coordinate System (Visual Center -> Canvas Center)
    // IMPORTANT: Scale the pan from Viewport space (500px) to Canvas space (1024px)
    const scaleFactor = outputSize / VIEWPORT_SIZE;

    ctx.translate(outputSize/2, outputSize/2);
    ctx.translate(pan.x * scaleFactor, pan.y * scaleFactor);
    ctx.scale(zoom, zoom);

    // Calculate image drawing dimensions to maintain aspect ratio
    const aspect = imgRef.current.naturalWidth / imgRef.current.naturalHeight;
    let drawWidth = outputSize;
    let drawHeight = outputSize;
    
    // Logic: The DOM renders height = VIEWPORT_SIZE (500px).
    // So for the canvas, we set height = outputSize (1024px) and scale width by aspect.
    // This effectively mimics "height: 100%" logic from the UI.
    drawWidth = outputSize * aspect;
    drawHeight = outputSize;

    // 3. Draw Layers
    // Layer A: Original Image
    ctx.drawImage(imgRef.current, -drawWidth/2, -drawHeight/2, drawWidth, drawHeight);
    
    // Layer B: Drawing Canvas (The bucket fills and brush strokes)
    if (drawingCanvasRef.current) {
        ctx.drawImage(drawingCanvasRef.current, -drawWidth/2, -drawHeight/2, drawWidth, drawHeight);
    }
    
    canvas.toBlob((blob) => {
      if (blob) onSave(blob);
    }, 'image/jpeg', 0.95);
  };

  const handleAiEdit = async () => {
    if (!imageSource || typeof imageSource === 'string') {
        alert("AI Edit requires a fresh file upload for now. Please re-upload.");
        return;
    }
    
    setIsProcessing(true);
    try {
        const resultBase64 = await onAiEdit(imageSource, aiPrompt);
        setImgSrc(resultBase64);
        setZoom(1);
        setPan({ x: 0, y: 0 });
        clearCanvas(drawingCanvasRef.current);
        clearCanvas(maskCanvasRef.current);
        setHistory([]); // Reset history on AI regen
        setHistoryStep(-1);
        setMode('move');
        saveHistory(); // Save new initial state
    } catch (e) {
        console.error("AI Edit failed", e);
        alert("Failed to generate image.");
    } finally {
        setIsProcessing(false);
    }
  };

  // --- UI Components ---
  
  const ToolButton = ({ tool, icon: Icon, label }: { tool: ToolMode, icon: any, label: string }) => (
    <button 
        onClick={() => setMode(tool)}
        className={`flex flex-col items-center justify-center p-3 rounded-xl transition-all w-full border ${
            mode === tool 
            ? 'bg-primary-600/20 border-primary-500 text-white shadow-[0_0_15px_rgba(99,102,241,0.3)]' 
            : 'bg-gray-800 border-transparent text-gray-400 hover:bg-gray-700 hover:text-gray-200'
        }`}
    >
        <Icon size={20} className="mb-1" />
        <span className="text-[10px] font-medium uppercase tracking-wider">{label}</span>
    </button>
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-md p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-6xl max-h-[95vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-950/50 flex-shrink-0">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <ImageIcon size={18} className="text-primary-400" />
            Image Studio
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Workspace */}
        <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
            
            {/* Toolbar (Left) */}
            <div className="w-full md:w-24 bg-gray-900 border-r border-gray-800 p-2 flex md:flex-col gap-2 overflow-x-auto md:overflow-visible flex-shrink-0 z-10">
                <ToolButton tool="move" icon={MousePointer2} label="Move" />
                <div className="w-full h-px bg-gray-800 my-1 hidden md:block"></div>
                <ToolButton tool="mask" icon={Shield} label="Preserve" />
                <ToolButton tool="bucket" icon={PaintBucket} label="Fill" />
                <ToolButton tool="brush" icon={Brush} label="Paint" />
                <ToolButton tool="eraser" icon={Eraser} label="Erase" />
            </div>

            {/* Canvas Area (Center) */}
            <div className="flex-1 bg-black/40 relative overflow-hidden flex items-center justify-center">
                {/* Background Grid Pattern */}
                <div className="absolute inset-0 opacity-10 pointer-events-none" 
                     style={{ backgroundImage: 'radial-gradient(#4f46e5 1px, transparent 1px)', backgroundSize: '20px 20px' }}>
                </div>
                
                {/* Checkboard Pattern for Transparency */}
                <div 
                    className="absolute inset-0 opacity-5 pointer-events-none"
                    style={{ 
                        backgroundImage: `linear-gradient(45deg, #333 25%, transparent 25%), linear-gradient(-45deg, #333 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #333 75%), linear-gradient(-45deg, transparent 75%, #333 75%)`,
                        backgroundSize: '20px 20px',
                        backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px' 
                    }}
                ></div>

                <div className="relative w-full h-full p-8 flex items-center justify-center overflow-hidden">
                    {imgSrc ? (
                        <>
                        {/* THE VIEWPORT: Fixed Square Container */}
                        <div 
                            ref={containerRef}
                            // Replaced clip-path shadow with box-shadow. 
                            // This creates a huge dark border around the 500px box, acting as the 'dim' overlay.
                            className={`relative border-2 border-white/20 shadow-[0_0_0_9999px_rgba(0,0,0,0.8)] overflow-hidden bg-black ${mode === 'move' ? 'cursor-move' : mode === 'bucket' ? 'cursor-crosshair' : 'cursor-none'}`}
                            style={{ width: `${VIEWPORT_SIZE}px`, height: `${VIEWPORT_SIZE}px` }}
                            onMouseDown={handleMouseDown}
                            onMouseMove={handleMouseMove}
                            onMouseUp={handleMouseUp}
                            onMouseLeave={handleMouseUp}
                            onTouchStart={handleMouseDown}
                            onTouchMove={handleMouseMove}
                            onTouchEnd={handleMouseUp}
                        >
                             {/* Transform Container - moves inside the viewport */}
                             <div 
                                style={{
                                    width: '100%',
                                    height: '100%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                                    transformOrigin: 'center center',
                                    transition: isDragging ? 'none' : 'transform 0.1s ease-out'
                                }}
                             >
                                <div className="relative">
                                    {/* 1. Base Image - Size matches viewport to start, but scales */}
                                    <img 
                                        ref={imgRef}
                                        src={imgSrc} 
                                        onLoad={handleImageLoad}
                                        alt="Edit" 
                                        className="max-w-none pointer-events-none select-none block"
                                        style={{ height: `${VIEWPORT_SIZE}px`, width: 'auto' }} 
                                        draggable={false}
                                    />
                                    {/* 2. Drawing Layer */}
                                    <canvas 
                                        ref={drawingCanvasRef}
                                        className="absolute inset-0 w-full h-full pointer-events-none"
                                    />
                                    {/* 3. Mask Layer */}
                                    <canvas 
                                        ref={maskCanvasRef}
                                        className="absolute inset-0 w-full h-full pointer-events-none opacity-60 mix-blend-screen"
                                    />
                                </div>
                             </div>

                             {/* GRID OVERLAY (Rule of Thirds) */}
                             {showGrid && (
                                <div className="absolute inset-0 pointer-events-none z-10 border border-white/10">
                                    <div className="w-full h-full grid grid-cols-3 grid-rows-3">
                                        {[...Array(9)].map((_, i) => (
                                            <div key={i} className="border border-white/10"></div>
                                        ))}
                                    </div>
                                    <div className="absolute top-0 left-0 w-full h-full border border-white/50"></div>
                                </div>
                             )}

                             {/* Custom Cursor */}
                             {(mode === 'brush' || mode === 'mask' || mode === 'eraser') && !isDragging && (
                                <div 
                                    className="pointer-events-none fixed border-2 rounded-full z-50 -translate-x-1/2 -translate-y-1/2"
                                    style={{ 
                                        // Calculates the visual size of the brush:
                                        // brushSize (image pixels) * baseScale (screen px / image px) * zoom
                                        width: brushSize * baseScale * zoom, 
                                        height: brushSize * baseScale * zoom,
                                        borderColor: mode === 'mask' ? '#0aff60' : mode === 'eraser' ? 'white' : brushColor,
                                        left: 'var(--cursor-x, -100px)',
                                        top: 'var(--cursor-y, -100px)'
                                    }}
                                    ref={el => {
                                        if (el) {
                                            document.addEventListener('mousemove', (e) => {
                                                el.style.setProperty('--cursor-x', `${e.clientX}px`);
                                                el.style.setProperty('--cursor-y', `${e.clientY}px`);
                                            });
                                        }
                                    }}
                                />
                             )}
                        </div>
                        
                        {/* Note: Outside mask removed, using box-shadow on container instead */}
                        </>
                    ) : (
                        <div className="text-gray-500 flex flex-col items-center">
                            <Loader2 className="animate-spin mb-2" />
                            Loading Image...
                        </div>
                    )}
                </div>

                {isProcessing && (
                    <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-50 backdrop-blur-sm">
                        <Loader2 size={48} className="text-neon-purple animate-spin mb-4" />
                        <span className="text-white text-lg font-medium animate-pulse">Generating AI Background...</span>
                    </div>
                )}
            </div>

            {/* Properties Panel (Right) */}
            <div className="w-full md:w-80 bg-gray-900 border-l border-gray-800 p-6 overflow-y-auto flex-shrink-0">
                
                {/* Mode Description */}
                <div className="mb-6 p-4 bg-gray-800 rounded-xl border border-gray-700">
                    <h4 className="text-white font-bold mb-1 flex items-center gap-2">
                        {mode === 'move' && <MousePointer2 size={16} />}
                        {mode === 'mask' && <Shield size={16} />}
                        {mode === 'bucket' && <PaintBucket size={16} />}
                        {mode === 'brush' && <Brush size={16} />}
                        {mode === 'eraser' && <Eraser size={16} />}
                        <span className="capitalize">{mode} Tool</span>
                    </h4>
                    <p className="text-xs text-gray-400 leading-relaxed">
                        {mode === 'move' && "Drag image to position inside the square frame."}
                        {mode === 'mask' && "Draw over subject to PROTECT it from fills."}
                        {mode === 'bucket' && "Fill empty areas. Respects protective mask."}
                        {mode === 'brush' && "Freehand paint."}
                        {mode === 'eraser' && "Erase paint."}
                    </p>
                </div>

                {/* Settings: Zoom */}
                <div className="space-y-4 mb-6">
                    <div className="flex justify-between">
                        <label className="text-xs font-bold text-gray-400 uppercase">Zoom</label>
                        <span className="text-xs text-primary-400 font-mono">{zoom.toFixed(1)}x</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <ZoomIn size={16} className="text-gray-500" />
                        <input 
                            type="range" 
                            min="0.5" 
                            max="15" 
                            step="0.1" 
                            value={zoom}
                            onChange={(e) => setZoom(parseFloat(e.target.value))}
                            className="flex-1 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-primary-500"
                        />
                    </div>
                </div>

                {/* Grid Toggle */}
                <div className="flex items-center justify-between mb-8 pb-4 border-b border-gray-800">
                     <label className="text-xs font-bold text-gray-400 uppercase flex items-center gap-2">
                        <Grid3X3 size={14} /> Show Grid
                     </label>
                     <button 
                        onClick={() => setShowGrid(!showGrid)}
                        className={`w-10 h-5 rounded-full relative transition-colors ${showGrid ? 'bg-primary-600' : 'bg-gray-700'}`}
                     >
                        <span className={`absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-transform ${showGrid ? 'translate-x-5' : 'translate-x-0'}`} />
                     </button>
                </div>

                {/* Settings: Brush/Color (Hidden in Move Mode) */}
                {mode !== 'move' && (
                    <div className="space-y-6 animate-in slide-in-from-right-4">
                        <div className="space-y-3">
                             <div className="flex justify-between text-xs text-gray-400 font-bold uppercase">
                                <span>Brush Size</span>
                                <span>{brushSize}px</span>
                            </div>
                            <input 
                                type="range" 
                                min="1" 
                                max="150" 
                                value={brushSize}
                                onChange={(e) => setBrushSize(parseInt(e.target.value))}
                                className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-white"
                            />
                        </div>

                        {(mode === 'brush' || mode === 'bucket') && (
                            <div className="space-y-3">
                                <label className="text-xs font-bold text-gray-400 uppercase flex items-center gap-2">
                                    <Palette size={14} /> Color
                                </label>
                                <div className="flex gap-2 flex-wrap">
                                    {['#ff0055', '#00f3ff', '#bc13fe', '#0aff60', '#ffffff', '#000000'].map(c => (
                                        <button 
                                            key={c}
                                            onClick={() => setBrushColor(c)}
                                            className={`w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 ${brushColor === c ? 'border-white scale-110' : 'border-transparent'}`}
                                            style={{ backgroundColor: c }}
                                        />
                                    ))}
                                    <input 
                                        type="color" 
                                        value={brushColor}
                                        onChange={(e) => setBrushColor(e.target.value)}
                                        className="w-8 h-8 rounded-full cursor-pointer bg-transparent border-0 p-0 overflow-hidden"
                                    />
                                </div>
                            </div>
                        )}
                        
                        <div className="flex gap-2">
                             <button 
                                onClick={handleUndo}
                                disabled={historyStep < 0}
                                className="flex-1 py-2 text-xs font-bold text-gray-300 hover:bg-gray-800 border border-gray-700 rounded transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                                title="Undo last stroke"
                            >
                                <Undo size={14} /> Undo
                            </button>
                             <button 
                                onClick={() => { clearCanvas(drawingCanvasRef.current); clearCanvas(maskCanvasRef.current); saveHistory(); }}
                                className="flex-1 py-2 text-xs font-bold text-red-400 hover:bg-red-900/20 border border-red-900/30 rounded transition-colors flex items-center justify-center gap-2"
                            >
                                <RotateCcw size={14} /> Reset
                            </button>
                        </div>
                    </div>
                )}
                
                {/* Masking Helper */}
                {mode === 'mask' && (
                     <div className="mt-4 pt-4 border-t border-gray-800">
                        <button 
                            onClick={handleFaceDetect}
                            className="w-full py-2 bg-green-900/30 text-green-400 border border-green-800 rounded hover:bg-green-900/50 transition-colors flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-wider"
                        >
                            <Scan size={14} /> Auto-Detect Face
                        </button>
                        <p className="text-[10px] text-gray-500 mt-2 text-center">
                            Attempts to auto-mask faces using system detection.
                        </p>
                     </div>
                )}

                {/* AI Section */}
                <div className="mt-4 pt-6 border-t border-gray-800 space-y-4">
                     <label className="text-xs font-bold text-neon-blue uppercase flex items-center gap-2">
                        <Sparkles size={14} />
                        Generative Fill
                    </label>
                    <textarea 
                        value={aiPrompt}
                        onChange={(e) => setAiPrompt(e.target.value)}
                        placeholder="Describe the background..."
                        className="w-full bg-black/30 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-neon-blue placeholder-gray-600 resize-none h-20"
                    />
                    <button 
                        onClick={handleAiEdit}
                        disabled={isProcessing}
                        className="w-full bg-gradient-to-r from-blue-600 to-cyan-500 text-white px-4 py-3 rounded-lg font-bold text-sm hover:brightness-110 disabled:opacity-50 transition-all shadow-lg shadow-blue-900/20"
                    >
                        {isProcessing ? 'Generating...' : 'Generate New Image'}
                    </button>
                </div>

            </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-800 flex justify-end gap-3 bg-gray-950/50 flex-shrink-0">
           <button onClick={onClose} className="px-5 py-2.5 text-gray-400 hover:text-white text-sm font-medium transition-colors">Discard</button>
           <button 
             onClick={handleSave}
             className="px-8 py-2.5 bg-white text-black rounded-full text-sm font-bold hover:bg-gray-200 transition-colors flex items-center gap-2 shadow-[0_0_20px_rgba(255,255,255,0.2)]"
           >
             <Check size={18} />
             Save & Apply
           </button>
        </div>

      </div>
    </div>
  );
};
