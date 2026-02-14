
import { GoogleGenAI, Type } from "@google/genai";
import { AnalysisResult } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Converts a File object to a Base64 string suitable for Gemini API.
 */
const fileToGenerativePart = async (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      // Remove the data URL prefix (e.g., "data:audio/mp3;base64,")
      const base64Data = base64String.split(",")[1];
      resolve(base64Data);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

/**
 * Sends audio to Gemini to identify speakers and timestamps.
 * @param audioFile The audio file to analyze
 * @param speakerCount (Optional) The exact number of speakers expected
 */
export const analyzeAudioDiarization = async (audioFile: File, speakerCount?: number): Promise<AnalysisResult> => {
  const audioBase64 = await fileToGenerativePart(audioFile);

  let prompt = `
    Perform a deep acoustic analysis of this audio file for high-precision speaker diarization.

    **MISSION CRITICAL - SIMULTANEOUS SPEECH:**
    The most important requirement is detecting when people speak AT THE SAME TIME. 
    - If Speaker A and Speaker B overlap (even for 0.5 seconds), you MUST output separate segments for BOTH speakers covering that specific time range.
    - NEVER merge multiple people into a "Group" or "Both" label. Always separate them.
    - Example: If A and B laugh together from 00:10 to 00:15, output:
      { "speaker": "Speaker A", "start": 10, "end": 15 }
      { "speaker": "Speaker B", "start": 10, "end": 15 }
  `;

  // Inject specific speaker count constraint if provided
  if (speakerCount && speakerCount > 0) {
    prompt += `
    **STRICT CONSTRAINT - SPEAKER COUNT:**
    - There are EXACTLY ${speakerCount} distinct speakers in this recording.
    - Do NOT identify more than ${speakerCount} speakers.
    - Do NOT identify fewer than ${speakerCount} speakers (unless the file is empty).
    - Label them consistently (e.g., "Speaker 1", "Speaker 2"... up to "Speaker ${speakerCount}").
    `;
  }

  prompt += `
    **DEEP RESEARCH & REASONING:**
    1. Listen for subtle cues: breath intakes, timbre changes, and micro-affirmations ("mm-hm", "yeah").
    2. Identify distinct speakers even if they sound similar.
    3. Use the 'thinking' process to map out the exact flow of conversation before generating the JSON.

    **OUTPUT FORMAT:**
    Return ONLY a JSON object with:
    - uniqueSpeakers: A list of speaker identifiers.
    - segments: A chronological list of speech segments with 'speaker', 'start', and 'end'.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview", 
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: audioFile.type,
              data: audioBase64,
            },
          },
          {
            text: prompt,
          },
        ],
      },
      config: {
        thinkingConfig: {
          thinkingBudget: 2048, // Allocate budget for deep reasoning/research
        },
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            uniqueSpeakers: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "List of unique speaker labels (e.g. Speaker A, Speaker B)",
            },
            segments: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  speaker: { type: Type.STRING },
                  start: { type: Type.NUMBER, description: "Start time in seconds" },
                  end: { type: Type.NUMBER, description: "End time in seconds" },
                },
                required: ["speaker", "start", "end"],
              },
            },
          },
          required: ["uniqueSpeakers", "segments"],
        },
      },
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI");

    // The response might be wrapped in markdown code blocks due to thinking model behavior sometimes
    const cleanText = text.replace(/```json\n?|\n?```/g, "").trim();
    
    const result = JSON.parse(cleanText) as AnalysisResult;
    return result;

  } catch (error) {
    console.error("Error analyzing audio:", error);
    throw new Error("Failed to analyze audio segments.");
  }
};

/**
 * Uses Gemini to edit an image (e.g., change background).
 */
export const editSpeakerImage = async (imageFile: File, prompt: string): Promise<string> => {
  const imageBase64 = await fileToGenerativePart(imageFile);

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          {
            inlineData: {
              data: imageBase64,
              mimeType: imageFile.type,
            },
          },
          {
            text: `Edit this image. ${prompt} Keep the main subject (person/face) exactly as is, only modify the background/surroundings. High quality, photorealistic.`,
          },
        ],
      },
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    
    throw new Error("No image generated.");
  } catch (error) {
    console.error("Error editing image:", error);
    throw new Error("Failed to edit image.");
  }
};

export interface FaceBox {
  ymin: number;
  xmin: number;
  ymax: number;
  xmax: number;
}

/**
 * Uses Gemini Vision to detect faces and return bounding boxes.
 */
export const detectFaces = async (imageFile: File): Promise<FaceBox[]> => {
  const imageBase64 = await fileToGenerativePart(imageFile);

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview", // Use a fast vision model
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: imageFile.type,
              data: imageBase64,
            },
          },
          {
            text: "Detect all human faces in this image. Return a list of bounding boxes with normalized coordinates (0 to 1).",
          },
        ],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              ymin: { type: Type.NUMBER },
              xmin: { type: Type.NUMBER },
              ymax: { type: Type.NUMBER },
              xmax: { type: Type.NUMBER },
            },
            required: ["ymin", "xmin", "ymax", "xmax"],
          },
        },
      },
    });

    const text = response.text;
    if (!text) return [];

    const faces = JSON.parse(text) as FaceBox[];
    return faces;
  } catch (error) {
    console.error("Error detecting faces:", error);
    return [];
  }
};
