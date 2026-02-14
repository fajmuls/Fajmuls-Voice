
import React from 'react';
import { SpeakerProfile } from '../types';
import { User, Upload, Edit2, Keyboard, Brush } from 'lucide-react';

interface SpeakerGridProps {
  speakers: SpeakerProfile[];
  activeSpeakerIds: string[]; 
  onUpdateImage: (speakerId: string, file: File) => void;
  onEditExistingImage: (speakerId: string) => void; // New prop for re-editing
  onUpdateName: (speakerId: string, newName: string) => void;
  onUpdateColor: (speakerId: string, newColor: string) => void;
  isManualMode?: boolean;
  isPlayMode?: boolean; // New prop for play mode
}

export const SpeakerGrid: React.FC<SpeakerGridProps> = ({ 
  speakers, 
  activeSpeakerIds, 
  onUpdateImage, 
  onEditExistingImage,
  onUpdateName,
  onUpdateColor,
  isManualMode = false,
  isPlayMode = false
}) => {
  
  // Dynamic grid class based on number of speakers
  const getGridClass = (count: number) => {
    if (count === 1) return 'grid-cols-1';
    if (count === 2) return 'grid-cols-1 md:grid-cols-2';
    if (count === 3) return 'grid-cols-1 md:grid-cols-3';
    if (count === 4) return 'grid-cols-2 md:grid-cols-2';
    return 'grid-cols-2 md:grid-cols-3';
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, speakerId: string) => {
    if (e.target.files && e.target.files[0]) {
      onUpdateImage(speakerId, e.target.files[0]);
    }
  };

  return (
    <div className={`grid ${getGridClass(speakers.length)} gap-4 w-full h-full min-h-[400px] p-4`}>
      {speakers.map((speaker) => {
        const isActive = activeSpeakerIds.includes(speaker.id);
        
        return (
          <div 
            key={speaker.id}
            className={`
              relative rounded-2xl overflow-hidden border-2 
              flex flex-col items-center justify-center group
              transition-all duration-100 ease-out
              ${isActive 
                ? `shadow-[0_0_50px_rgba(0,0,0,0.6)] z-10 opacity-100 grayscale-0` 
                : 'border-gray-800 opacity-40 scale-95 grayscale'
              }
            `}
            style={{
              borderColor: isActive ? speaker.color : '#1f2937',
              boxShadow: isActive ? `0 0 60px ${speaker.color}40` : 'none'
            }}
          >
            {/* Background Image / Placeholder */}
            {/* Apply 'animate-beat' here when active to pulse the image/content */}
            <div className={`absolute inset-0 w-full h-full bg-gray-900 transition-all duration-200 ${isActive ? 'animate-beat' : ''}`}>
               {speaker.imageUrl ? (
                 <img 
                    src={speaker.imageUrl} 
                    alt={speaker.name} 
                    className="w-full h-full object-cover"
                 />
               ) : (
                 <div className="w-full h-full flex items-center justify-center bg-gray-800">
                    <User size={64} className="text-gray-600" />
                 </div>
               )}
            </div>

            {/* Overlay Gradient (Hidden in Play Mode) */}
            {!isPlayMode && (
              <div 
                className={`absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent transition-opacity duration-200 ${isActive ? 'opacity-20' : 'opacity-90'}`} 
              />
            )}

            {/* Content Container (Name, etc.) - Hidden in Play Mode */}
            {!isPlayMode && (
            <div className="absolute bottom-6 left-6 right-6 z-20">
               <div className="flex justify-between items-end">
                  <div className="flex-1 mr-4">
                    {/* Editable Name Input */}
                    <div className="relative group/input">
                      <input
                        type="text"
                        value={speaker.name}
                        onChange={(e) => onUpdateName(speaker.id, e.target.value)}
                        className="bg-transparent text-2xl font-bold tracking-wider text-white border-b border-transparent hover:border-white/30 focus:border-white focus:outline-none w-full transition-colors pb-1"
                        style={{ 
                          textShadow: '0 2px 4px rgba(0,0,0,0.8)',
                          color: isActive ? speaker.color : 'white'
                        }}
                      />
                      <Edit2 size={12} className="absolute right-0 top-2 text-gray-500 opacity-0 group-hover/input:opacity-100 transition-opacity pointer-events-none" />
                    </div>
                    {/* Manual Mode Key Indicator */}
                    {isManualMode && speaker.triggerKey && (
                      <div className="mt-2 flex items-center gap-2 text-gray-400">
                        <Keyboard size={14} />
                        <span className="text-xs font-mono border border-gray-600 rounded px-1.5 py-0.5 bg-gray-800/80">
                          {speaker.triggerKey.toUpperCase()}
                        </span>
                      </div>
                    )}
                  </div>
                  
                  {/* Status & Color Control */}
                  <div className="flex flex-col items-center gap-3">
                    {/* Status Indicator (Pulse) */}
                    <div className="relative">
                      {isActive && (
                        <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping`} style={{ backgroundColor: speaker.color }}></span>
                      )}
                      
                      {/* Color Picker Wrapper */}
                      <div className="relative group/color cursor-pointer">
                        <div 
                          className={`w-4 h-4 rounded-full shadow-lg transition-colors duration-200 border border-white/20`}
                          style={{ backgroundColor: speaker.color }}
                        />
                         {/* Native Color Input hidden on top */}
                        <input 
                          type="color"
                          value={speaker.color}
                          onChange={(e) => onUpdateColor(speaker.id, e.target.value)}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                          title="Change Speaker Color"
                        />
                      </div>
                    </div>
                  </div>
               </div>
            </div>
            )}

            {/* Top Right Controls: Upload & Edit - Hidden in Play Mode */}
            {!isPlayMode && (
            <div className="absolute top-4 right-4 flex flex-col gap-2 z-30 transition-all opacity-0 group-hover:opacity-100">
                {/* Re-Edit Button (Only if image exists) */}
                {speaker.imageUrl && (
                    <button 
                        onClick={() => onEditExistingImage(speaker.id)}
                        className="p-2 rounded-full bg-black/40 hover:bg-black/80 text-white border border-white/10 hover:border-white/50 backdrop-blur-sm transition-all"
                        title="Edit existing image"
                    >
                        <Brush size={16} />
                    </button>
                )}

                {/* Upload Button */}
                <label className="cursor-pointer p-2 rounded-full bg-black/40 hover:bg-black/80 text-white border border-white/10 hover:border-white/50 backdrop-blur-sm transition-all" title="Upload new image">
                    <Upload size={16} />
                    <input 
                        type="file" 
                        className="hidden" 
                        accept="image/*"
                        onChange={(e) => handleFileChange(e, speaker.id)}
                    />
                </label>
            </div>
            )}

          </div>
        );
      })}
    </div>
  );
};
