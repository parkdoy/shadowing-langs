// src/hooks/usePlayerControls.ts
import { useState, useRef, useEffect } from 'react';
import { YouTubePlayer } from 'react-youtube';
import { Sentence, PlayerData } from '../types';

export const usePlayerControls = (playerData: PlayerData | null) => {
  const [activeSentenceIndex, setActiveSentenceIndex] = useState<number | null>(null);
  const [selectionRange, setSelectionRange] = useState<{ start: number | null; end: number | null }>({ start: null, end: null });
  const [selectionProgress, setSelectionProgress] = useState(0);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const loopIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (!playerData || playerData.sentences.length === 0) {
        setSelectionProgress(0);
        return;
    }

    const totalSentences = playerData.sentences.length;
    let lastSelectedIndex = -1;

    if (selectionRange.end !== null) {
        lastSelectedIndex = selectionRange.end;
    } else if (activeSentenceIndex !== null) {
        lastSelectedIndex = activeSentenceIndex;
    }

    if (lastSelectedIndex !== -1) {
        const progressPercent = ((lastSelectedIndex + 1) / totalSentences) * 100;
        setSelectionProgress(progressPercent);
    } else {
        setSelectionProgress(0);
    }
  }, [activeSentenceIndex, selectionRange, playerData]);

  const stopLoop = () => {
    if (loopIntervalRef.current) {
      clearInterval(loopIntervalRef.current);
      loopIntervalRef.current = null;
    }
  };

  useEffect(() => {
    // Clear interval on unmount
    return () => {
      stopLoop();
    };
  }, []);

  const handleSentenceClick = (sentence: Sentence, index: number, event: React.MouseEvent) => {
    if (!playerRef.current) return;
    stopLoop();

    if (event.shiftKey && activeSentenceIndex !== null) {
        const newStart = Math.min(activeSentenceIndex, index);
        const newEnd = Math.max(activeSentenceIndex, index);
        setSelectionRange({ start: newStart, end: newEnd });
        setActiveSentenceIndex(null);
    } else {
        setSelectionRange({ start: null, end: null });
        setActiveSentenceIndex(index);
        const player = playerRef.current;
        player.seekTo(sentence.start, true);
        player.playVideo();

        loopIntervalRef.current = window.setInterval(() => {
            const currentTime = player.getCurrentTime();
            if (currentTime >= sentence.end) {
                player.seekTo(sentence.start, true);
            }
        }, 200);
    }
  };

  const playSelection = () => {
    if (!playerRef.current || selectionRange.start === null || selectionRange.end === null || !playerData) return;
    stopLoop();
    setActiveSentenceIndex(null);

    const startSentence = playerData.sentences[selectionRange.start];
    const endSentence = playerData.sentences[selectionRange.end];
    const startTime = startSentence.start;
    const endTime = endSentence.end;

    const player = playerRef.current;
    player.seekTo(startTime, true);
    player.playVideo();

    loopIntervalRef.current = window.setInterval(() => {
        const currentTime = player.getCurrentTime();
        if (currentTime >= endTime) {
            player.seekTo(startTime, true);
        }
    }, 200);
  };

  // Reset selection when player data changes
  useEffect(() => {
    setActiveSentenceIndex(null);
    setSelectionRange({ start: null, end: null });
  }, [playerData]);

  return {
    playerRef,
    activeSentenceIndex,
    selectionRange,
    selectionProgress,
    handleSentenceClick,
    playSelection,
    stopLoop,
    setActiveSentenceIndex, // Expose setters if needed externally
    setSelectionRange,
  };
};
