// src/types.ts
export interface Sentence {
  text: string;
  start: number;
  end: number;
}

export interface PlayerData {
  originalUrl: string;
  videoId: string;
  sentences: Sentence[];
  title?: string;
}
