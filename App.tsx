
import React, { useState, useEffect, useRef } from 'react';
import { analyzeAudioDiarization, editSpeakerImage, detectFaces, FaceBox } from './services/geminiService';
import { AnalysisResult, SpeakerProfile } from './types';
import { SpeakerGrid } from './components/SpeakerGrid';
import { AudioPlayer } from './components/AudioPlayer';
import { ImageEditModal } from './components/ImageEditModal';
import { Mic, UploadCloud, AlertCircle, Loader2, Download, Keyboard, Sparkles, BrainCircuit, Users, Maximize2 } from 'lucide-react';

// Helper to generate distinct colors
const generateSpeakerColor = (index: number): string => {
  const hue = (index * 137.508) % 360;
  const s = 75; 
  const l = 50;
  
  const hDecimal = hue;
  const sDecimal = s / 100;
  const lDecimal = l / 100;

  const a = sDecimal * Math.min(lDecimal, 1 - lDecimal);
  const f = (n: number) => {
    const k = (n + hDecimal / 30) % 12;
    const color = lDecimal - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };

  return `#${f(0)}${f(8)}${f(4)}`;
};

type AppMode = 'upload' | 'setup' | 'analyzing' | 'visualizer';
type DetectionMode = 'auto' | 'manual';

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>('upload');
  const [detectionMode, setDetectionMode] = useState<DetectionMode>('auto');
  
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [speakers, setSpeakers] = useState<SpeakerProfile[]>([]);
  
  // Configuration
  const [manualSpeakerCount, setManualSpeakerCount] = useState<number>(2);
  const [autoSpeakerCount, setAutoSpeakerCount] = useState<number | ''>(''); // Empty string means "Auto detect"
  const [manualActiveKeys, setManualActiveKeys] = useState<Set<string>>(new Set());

  // Auto Mode State
  const [activeSpeakerIds, setActiveSpeakerIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Play Mode State
  const [isPlayMode, setIsPlayMode] = useState(false);

  // Image Editing State
  const [editingSpeakerId, setEditingSpeakerId] = useState<string | null>(null);
  const [editingImageSource, setEditingImageSource] = useState<File | string | null>(null);

  // Setup Step (For choosing mode)
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      if (!file.type.startsWith('audio/')) {
        setError('Please upload a valid audio file.');
        return;
      }
      setAudioFile(file);
      setError(null);
      setMode('setup'); // Go to setup screen
    }
  };

  // Start Process (Auto or Manual)
  const startProcess = async () => {
    if (!audioFile) return;

    if (detectionMode === 'manual') {
      // Setup Manual Speakers
      const generatedSpeakers: SpeakerProfile[] = Array.from({ length: manualSpeakerCount }).map((_, i) => {
        // Assign default keys: 1, 2, 3...
        const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
        const key = keys[i] || '?';
        return {
          id: `manual_${i}`,
          name: `Speaker ${i + 1}`,
          imageUrl: null,
          color: generateSpeakerColor(i),
          triggerKey: key
        };
      });
      setSpeakers(generatedSpeakers);
      setMode('visualizer');
    } else {
      // Start AI Auto-Detection
      setMode('analyzing');
      try {
        const count = autoSpeakerCount === '' ? undefined : Number(autoSpeakerCount);
        const result = await analyzeAudioDiarization(audioFile, count);
        setAnalysisResult(result);
        
        const initialSpeakers = result.uniqueSpeakers.map((id, index) => ({
          id,
          name: id, 
          imageUrl: null,
          color: generateSpeakerColor(index)
        }));
        setSpeakers(initialSpeakers);
        setMode('visualizer');
      } catch (err) {
        console.error(err);
        setError('AI Analysis failed. Try Manual Mode or a shorter file.');
        setMode('setup');
      }
    }
  };

  // Manual Key Listeners
  useEffect(() => {
    if (mode !== 'visualizer' || detectionMode !== 'manual') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      setManualActiveKeys(prev => {
        const next = new Set(prev);
        next.add(key);
        return next;
      });
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      setManualActiveKeys(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [mode, detectionMode]);

  // Update active speakers based on manual keys
  useEffect(() => {
    if (detectionMode === 'manual') {
      const activeIds = speakers
        .filter(s => s.triggerKey && manualActiveKeys.has(s.triggerKey.toLowerCase()))
        .map(s => s.id);
      setActiveSpeakerIds(activeIds);
    }
  }, [manualActiveKeys, speakers, detectionMode]);


  // Helper handlers
  const handleUpdateImage = (speakerId: string, file: File) => {
    // Open editor with new file
    setEditingSpeakerId(speakerId);
    setEditingImageSource(file);
  };

  const handleEditExistingImage = (speakerId: string) => {
    const speaker = speakers.find(s => s.id === speakerId);
    if (speaker && speaker.imageUrl) {
        setEditingSpeakerId(speakerId);
        setEditingImageSource(speaker.imageUrl);
    }
  };

  const handleSaveEditedImage = (editedBlob: Blob) => {
    if (editingSpeakerId) {
       const imageUrl = URL.createObjectURL(editedBlob);
       setSpeakers(prev => prev.map(s => s.id === editingSpeakerId ? { ...s, imageUrl } : s));
    }
    // Cleanup
    setEditingSpeakerId(null);
    setEditingImageSource(null);
  };
  
  const handleAiImageEdit = async (file: File, prompt: string) => {
    return await editSpeakerImage(file, prompt);
  };

  const handleAiFaceDetect = async (file: File): Promise<FaceBox[]> => {
    return await detectFaces(file);
  };

  const handleUpdateName = (speakerId: string, newName: string) => {
    setSpeakers(prev => prev.map(s => s.id === speakerId ? { ...s, name: newName } : s));
  };

  const handleUpdateColor = (speakerId: string, newColor: string) => {
    setSpeakers(prev => prev.map(s => s.id === speakerId ? { ...s, color: newColor } : s));
  };

  const handleExport = () => {
    const data = {
      metadata: { exportedAt: new Date().toISOString(), version: "1.0", mode: detectionMode },
      speakers: speakers.map(s => ({ id: s.id, name: s.name, color: s.color, triggerKey: s.triggerKey })),
      segments: analysisResult?.segments || []
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fajmuls-voice-${detectionMode}-${new Date().getTime()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleTimeUpdate = (currentTime: number) => {
    if (detectionMode === 'manual') return; // Handled by keys
    if (!analysisResult) return;

    // AI Logic: Find all speakers active in this moment
    const activeSegments = analysisResult.segments.filter(
      seg => currentTime >= seg.start && currentTime <= seg.end
    );
    const currentActiveIds = Array.from(new Set(activeSegments.map(s => s.speaker)));

    setActiveSpeakerIds(prev => {
      if (prev.length !== currentActiveIds.length) return currentActiveIds;
      const sortedPrev = [...prev].sort();
      const sortedCurr = [...currentActiveIds].sort();
      return sortedPrev.every((val, index) => val === sortedCurr[index]) ? prev : currentActiveIds;
    });
  };

  const handleReset = () => {
    setAudioFile(null);
    setAnalysisResult(null);
    setSpeakers([]);
    setActiveSpeakerIds([]);
    setManualActiveKeys(new Set());
    setMode('upload');
    setAutoSpeakerCount('');
    setError(null);
    setIsPlayMode(false);
  };

  // --- Views ---

  // 1. Upload Screen
  if (mode === 'upload') {
    return (
      <div className="min-h-screen bg-[#0b0f19] flex items-center justify-center p-4">
        <div className="max-w-xl w-full text-center space-y-8">
          <div className="space-y-2">
            <h1 className="text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary-400 to-neon-purple animate-pulse">
              Fajmuls Voice
            </h1>
            <p className="text-gray-400">Deep AI Audio Diarization & Visualization</p>
          </div>
          <div className="relative group cursor-pointer">
            <div className="absolute -inset-1 bg-gradient-to-r from-primary-600 to-neon-blue rounded-2xl blur opacity-25 group-hover:opacity-75 transition duration-1000 group-hover:duration-200"></div>
            <div className="relative p-10 bg-gray-900 ring-1 ring-gray-800 rounded-2xl leading-none flex flex-col items-center justify-center space-y-6">
              <div className="w-20 h-20 rounded-full bg-gray-800 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                <UploadCloud size={40} className="text-primary-400" />
              </div>
              <div className="space-y-1">
                <p className="text-xl font-medium text-gray-200">Select Audio File</p>
                <p className="text-sm text-gray-500">MP3, WAV, OGG supported</p>
              </div>
              <input type="file" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" accept="audio/*" onChange={handleFileSelect} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 2. Setup Screen (Choose Mode)
  if (mode === 'setup') {
    return (
      <div className="min-h-screen bg-[#0b0f19] flex items-center justify-center p-4">
        <div className="max-w-2xl w-full space-y-8 bg-gray-900/50 p-8 rounded-2xl border border-gray-800 backdrop-blur-xl">
          <div className="text-center space-y-2">
            <h2 className="text-3xl font-bold text-white">Analysis Configuration</h2>
            <p className="text-gray-400">How would you like to process "{audioFile?.name}"?</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Auto Mode Card */}
            <div 
              onClick={() => setDetectionMode('auto')}
              className={`p-6 rounded-xl border-2 cursor-pointer transition-all relative overflow-hidden ${detectionMode === 'auto' ? 'border-primary-500 bg-primary-500/10' : 'border-gray-700 hover:border-gray-600'}`}
            >
              <div className="flex items-center gap-3 mb-4">
                <Sparkles className="text-neon-blue" size={24} />
                <h3 className="text-xl font-bold text-white">AI Deep Detect</h3>
              </div>
              <p className="text-gray-400 text-sm mb-4">
                Uses Gemini 2.0 Thinking model to deeply analyze simultaneous speech. Best for precision.
              </p>

              {/* Speaker Count Input for AI */}
              {detectionMode === 'auto' && (
                <div className="mt-4 pt-4 border-t border-gray-700/50 animate-in fade-in slide-in-from-top-2">
                  <label className="text-sm text-gray-300 block mb-2 flex items-center gap-2">
                    <Users size={14} />
                    How many speakers? <span className="text-gray-500 text-xs">(Optional)</span>
                  </label>
                  <input 
                    type="number" 
                    min="1" 
                    max="20"
                    placeholder="Auto-detect if empty"
                    value={autoSpeakerCount} 
                    onChange={(e) => setAutoSpeakerCount(e.target.value === '' ? '' : parseInt(e.target.value))}
                    className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white placeholder-gray-600 focus:outline-none focus:border-primary-500"
                    onClick={(e) => e.stopPropagation()} 
                  />
                  <p className="text-xs text-primary-400/80 mt-1">
                    *Specifying exact count greatly improves AI accuracy.
                  </p>
                </div>
              )}
            </div>

            {/* Manual Mode Card */}
            <div 
              onClick={() => setDetectionMode('manual')}
              className={`p-6 rounded-xl border-2 cursor-pointer transition-all relative overflow-hidden ${detectionMode === 'manual' ? 'border-neon-purple bg-neon-purple/10' : 'border-gray-700 hover:border-gray-600'}`}
            >
              <div className="flex items-center gap-3 mb-4">
                <Keyboard className="text-neon-purple" size={24} />
                <h3 className="text-xl font-bold text-white">Manual Control</h3>
              </div>
              <p className="text-gray-400 text-sm mb-4">
                Manually control speaker lights using keyboard keys (1, 2, 3...) while listening. Best for live control.
              </p>
              {detectionMode === 'manual' && (
                <div className="mt-4 pt-4 border-t border-gray-700/50 animate-in fade-in slide-in-from-top-2">
                  <label className="text-sm text-gray-300 block mb-2 flex items-center gap-2">
                    <Users size={14} />
                    Number of Speakers:
                  </label>
                  <input 
                    type="number" 
                    min="1" 
                    max="9" 
                    value={manualSpeakerCount} 
                    onChange={(e) => setManualSpeakerCount(parseInt(e.target.value))}
                    className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white focus:outline-none focus:border-neon-purple"
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-between pt-4">
             <button onClick={handleReset} className="text-gray-500 hover:text-white transition-colors">Cancel</button>
             <button 
               onClick={startProcess}
               className="bg-white text-black px-8 py-3 rounded-full font-bold hover:bg-gray-200 transition-colors flex items-center gap-2"
             >
               {detectionMode === 'auto' ? 'Start AI Analysis' : 'Start Manual Session'}
             </button>
          </div>
          
          {error && <div className="text-red-400 text-center text-sm">{error}</div>}
        </div>
      </div>
    );
  }

  // 3. Analyzing Screen (Only for Auto)
  if (mode === 'analyzing') {
    return (
      <div className="min-h-screen bg-[#0b0f19] flex flex-col items-center justify-center p-8 space-y-8">
        <div className="relative w-32 h-32">
          {/* Pulsing outer ring */}
          <div className="absolute inset-0 border-4 border-primary-500/30 rounded-full animate-ping"></div>
          {/* Spinning gradient ring */}
          <div className="absolute inset-0 border-4 border-t-neon-blue border-r-neon-purple border-b-primary-500 border-l-transparent rounded-full animate-spin"></div>
          
          <div className="absolute inset-0 flex items-center justify-center">
            <BrainCircuit size={48} className="text-white animate-pulse" />
          </div>
        </div>
        
        <div className="text-center space-y-4 max-w-lg">
          <h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-neon-blue to-neon-purple">
            Deep AI Researching...
          </h2>
          <div className="space-y-2">
            <div className="h-1 w-full bg-gray-800 rounded-full overflow-hidden">
               <div className="h-full bg-primary-500 w-1/2 animate-[pulse_1s_ease-in-out_infinite]"></div>
            </div>
            <p className="text-gray-400 text-sm">
              Analyzing acoustic patterns, separating overlapping voices, and verifying speaker identities.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // 4. Visualizer (Main App)
  return (
    <div className="h-screen bg-[#0b0f19] flex flex-col overflow-hidden">
      {/* Header - Hidden in Play Mode */}
      {!isPlayMode && (
        <header className="px-6 py-4 flex items-center justify-between bg-gray-900/50 backdrop-blur border-b border-gray-800 z-50">
          <div className="flex items-center gap-2">
            <div className="w-2 h-8 bg-primary-500 rounded-full"></div>
            <h1 className="text-xl font-bold tracking-tight text-white">Fajmuls Voice <span className="text-xs text-gray-500 font-normal ml-2 border border-gray-800 px-2 py-0.5 rounded uppercase">{detectionMode} MODE</span></h1>
          </div>
          <div className="flex items-center gap-4 text-sm text-gray-400">
            <button 
              onClick={() => setIsPlayMode(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-gray-800 transition-colors text-xs font-medium border border-gray-800 text-neon-blue border-neon-blue/20 hover:bg-neon-blue/10"
            >
              <Maximize2 size={14} />
              Play Mode
            </button>
            <button 
              onClick={handleExport}
              className="flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-gray-800 transition-colors text-xs font-medium border border-gray-800"
            >
              <Download size={14} />
              Export Data
            </button>
            <span className="w-px h-4 bg-gray-700"></span>
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
              {speakers.length} Speakers
            </span>
          </div>
        </header>
      )}

      {/* Main Grid Area */}
      <main className="flex-1 relative overflow-hidden">
        <SpeakerGrid 
          speakers={speakers}
          activeSpeakerIds={activeSpeakerIds}
          onUpdateImage={handleUpdateImage}
          onEditExistingImage={handleEditExistingImage}
          onUpdateName={handleUpdateName}
          onUpdateColor={handleUpdateColor}
          isManualMode={detectionMode === 'manual'}
          isPlayMode={isPlayMode}
        />
        
      </main>

      {/* Footer / Player */}
      {audioFile && (
        <AudioPlayer 
          file={audioFile}
          onTimeUpdate={handleTimeUpdate}
          onReset={handleReset}
          isPlayMode={isPlayMode}
          onTogglePlayMode={() => setIsPlayMode(!isPlayMode)}
        />
      )}

      {/* Image Editor Modal */}
      {editingSpeakerId && editingImageSource && (
        <ImageEditModal 
          isOpen={true}
          imageSource={editingImageSource}
          onClose={() => {
            setEditingSpeakerId(null);
            setEditingImageSource(null);
          }}
          onSave={handleSaveEditedImage}
          onAiEdit={handleAiImageEdit}
          onDetectFaces={handleAiFaceDetect}
        />
      )}
    </div>
  );
};

export default App;
