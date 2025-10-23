// src/components/PlayerView.tsx
import React from 'react';
import YouTube, { YouTubePlayer, YouTubeEvent } from 'react-youtube';
import { PlayerData } from '../types';
import { usePlayerControls } from '../hooks/usePlayerControls';

interface PlayerViewProps {
  playerData: PlayerData;
}

export const PlayerView: React.FC<PlayerViewProps> = ({ playerData }) => {
  const {
    playerRef,
    activeSentenceIndex,
    selectionRange,
    selectionProgress,
    handleSentenceClick,
    playSelection,
    stopLoop,
  } = usePlayerControls(playerData);

  const onPlayerReady = (event: YouTubeEvent) => {
    playerRef.current = event.target;
  };

  const onPlayerStateChange = (event: YouTubeEvent) => {
    if (event.data === YouTube.PlayerState.PAUSED || event.data === YouTube.PlayerState.ENDED) {
      stopLoop();
    }
  };

  const isSelectionActive = selectionRange.start !== null;

  return (
    <div className="player-container">
      <button onClick={() => window.location.reload()} style={{ marginBottom: '1rem' }}>처음으로</button>
      {playerData.title && <h3>{playerData.title}</h3>}
      <div className="youtube-wrapper">
        <YouTube
          videoId={playerData.videoId}
          opts={{ width: '100%', height: '480' }}
          onReady={onPlayerReady}
          onStateChange={onPlayerStateChange}
        />
      </div>
      <div className="controls">
        {isSelectionActive && (
          <button onClick={playSelection}>선택 구간 반복</button>
        )}
        <button onClick={stopLoop}>반복 중지</button>
      </div>
      <div className="sentence-list">
        <div style={{ padding: '10px 0' }}>
          <span>학습 진행도: {Math.round(selectionProgress)}%</span>
          <progress value={selectionProgress} max="100" style={{ width: '100%' }} />
        </div>
        {playerData.sentences.map((sentence, index) => {
          const isSelected = isSelectionActive && selectionRange.start !== null && selectionRange.end !== null && index >= selectionRange.start && index <= selectionRange.end;
          const isActive = index === activeSentenceIndex && !isSelectionActive;

          return (
            <div
              key={index}
              className={`sentence ${isActive ? 'active' : ''} ${isSelected ? 'selected' : ''}`}
              onClick={(e) => handleSentenceClick(sentence, index, e)}
            >
              {sentence.text}
            </div>
          );
        })}
      </div>
    </div>
  );
};
