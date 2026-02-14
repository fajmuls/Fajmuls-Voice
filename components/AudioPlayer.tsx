
import React, { useRef, useEffect, useState } from 'react';
import { Play, Pause, RefreshCw, Volume2, VolumeX, Maximize2, Minimize2 } from 'lucide-react';

interface AudioPlayerProps {
  file: File;
  onTimeUpdate: (currentTime: number) => void;
  onReset: () => void;
  isPlayMode: boolean;
  onTogglePlayMode: () => void;
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({ file, onTimeUpdate, onReset, isPlayMode, onTogglePlayMode }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const animationRef = useRef<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    if (file) {
      const url = URL.createObjectURL(file);
      setAudioUrl(url);
      return () => {
        URL.revokeObjectURL(url);
      };
    }
  }, [file]);

  // Clean up animation frame on unmount or stop
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  // Sync volume with audio element
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  const updateProgress = () => {
    if (audioRef.current) {
      const time = audioRef.current.currentTime;
      setCurrentTime(time);
      onTimeUpdate(time);
      
      if (!audioRef.current.paused && !audioRef.current.ended) {
        animationRef.current = requestAnimationFrame(updateProgress);
      }
    }
  };

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
        if (animationRef.current) cancelAnimationFrame(animationRef.current);
      } else {
        audioRef.current.play();
        animationRef.current = requestAnimationFrame(updateProgress);
      }
      setIsPlaying(!isPlaying);
    }
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
  };

  const handleEnded = () => {
    setIsPlaying(false);
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = Number(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
      onTimeUpdate(time);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (val > 0 && isMuted) setIsMuted(false);
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className="w-full bg-gray-900 border-t border-gray-800 p-4 shadow-2xl z-50">
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={handleEnded}
        />
      )}

      <div className="max-w-6xl mx-auto flex items-center gap-6">
        {/* Play/Pause */}
        <button
          onClick={togglePlay}
          className="w-12 h-12 flex-shrink-0 flex items-center justify-center rounded-full bg-primary-600 hover:bg-primary-500 text-white transition-all shadow-lg hover:shadow-primary-500/30"
        >
          {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="ml-1" />}
        </button>

        {/* Time Slider */}
        <div className="flex-1 flex flex-col justify-center">
          <div className="flex justify-between text-xs text-gray-400 font-mono mb-1">
             <span>{formatTime(currentTime)}</span>
             <span>{formatTime(duration)}</span>
          </div>
          <input
            type="range"
            min="0"
            max={duration}
            value={currentTime}
            onChange={handleSeek}
            step="0.01"
            className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-primary-500 hover:accent-primary-400"
          />
        </div>

        {/* Volume Control */}
        <div className="flex items-center gap-2 w-32 group">
          <button onClick={toggleMute} className="text-gray-400 hover:text-white transition-colors">
            {isMuted || volume === 0 ? <VolumeX size={20} /> : <Volume2 size={20} />}
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={isMuted ? 0 : volume}
            onChange={handleVolumeChange}
            className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-gray-400 hover:accent-white"
          />
        </div>

        <div className="h-8 w-px bg-gray-800 mx-2"></div>

        {/* Play Mode Toggle */}
        <button 
          onClick={onTogglePlayMode}
          className={`p-2 transition-colors ${isPlayMode ? 'text-neon-blue' : 'text-gray-500 hover:text-white'}`}
          title={isPlayMode ? "Exit Play Mode" : "Enter Play Mode"}
        >
          {isPlayMode ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
        </button>

        {/* Reset Button */}
        <button 
          onClick={onReset}
          className="p-2 text-gray-500 hover:text-white transition-colors"
          title="Reset & Upload New"
        >
          <RefreshCw size={20} />
        </button>
      </div>
    </div>
  );
};
