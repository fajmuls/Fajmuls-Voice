
export interface SpeakerSegment {
  speaker: string;
  start: number;
  end: number;
}

export interface AnalysisResult {
  uniqueSpeakers: string[];
  segments: SpeakerSegment[];
}

export interface SpeakerProfile {
  id: string; // e.g., "Speaker A"
  name: string;
  imageUrl: string | null;
  color: string;
  triggerKey?: string; // For manual mode
}

export const SPEAKER_COLORS = [
  '#00f3ff', // Cyan
  '#bc13fe', // Purple
  '#0aff60', // Green
  '#ff0055', // Red/Pink
  '#ffbb00', // Yellow
  '#0066ff', // Blue
  '#ff5500', // Orange
  '#b300ff', // Violet
];
