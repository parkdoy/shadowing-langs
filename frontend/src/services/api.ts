// src/services/api.ts
import { PlayerData, Sentence } from "../types";

const API_BASE_URL = 'http://127.0.0.1:5000';

export const getOutputFiles = async (): Promise<string[]> => {
  const response = await fetch(`${API_BASE_URL}/api/output-files`);
  if (!response.ok) {
    throw new Error('Failed to fetch output files.');
  }
  return response.json();
};

export const processVideo = (
  videoUrl: string,
  onProgress: (progress: number, message: string) => void,
): Promise<PlayerData> => {
  return new Promise<PlayerData>(async (resolve, reject) => {
    try {
      const response = await fetch(`${API_BASE_URL}/process`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ video_url: videoUrl }),
      });

      if (!response.body) {
        throw new Error('Response body is null');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let partialLine = '';

      const processChunk = async () => {
        try {
          const { done, value } = await reader.read();
          if (done) {
            // This can happen if the stream ends unexpectedly.
            // Depending on the desired behavior, you might want to reject or resolve with partial data.
            reject(new Error('Stream ended without providing final data.'));
            return;
          }

          const chunk = decoder.decode(value, { stream: true });
          const lines = (partialLine + chunk).split(/\r?\n/);
          partialLine = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data:')) {
              const jsonString = line.substring(5).trim();
              if (jsonString) {
                const data = JSON.parse(jsonString);
                if (data.error) {
                  reject(new Error(data.error));
                  return;
                }
                if (typeof data.progress === 'number') {
                  onProgress(data.progress, data.message || '');
                }
                if (data.final_data) {
                  resolve(data.final_data);
                  return; // Stop processing further chunks
                }
              }
            }
          }
          await processChunk(); // Continue reading the stream
        } catch (err) {
          reject(err);
        }
      };

      await processChunk();

    } catch (err) {
      reject(err);
    }
  });
};

export const loadOutputFile = async (filename: string): Promise<PlayerData> => {
  const response = await fetch(`${API_BASE_URL}/output/${filename}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${filename}`);
  }
  const rawData = await response.json();

  const videoIdMatch = filename.match(/_([a-zA-Z0-9-]{11})\.json$/);
  const videoId = videoIdMatch ? videoIdMatch[1] : 'unknown';

  if (Array.isArray(rawData) && rawData.every((item: any) => 'text' in item && 'start' in item && 'end' in item)) {
    return {
      originalUrl: '',
      videoId: videoId,
      sentences: rawData as Sentence[],
      title: filename.replace(/_[a-zA-Z0-9-]{11}\.json$/, '')
    };
  } else if (typeof rawData === 'object' && rawData !== null && 'videoId' in rawData && 'sentences' in rawData) {
    return {
      originalUrl: (rawData as any).originalUrl || '',
      ...(rawData as PlayerData)
    };
  } else {
    throw new Error('Unsupported file format.');
  }
};
