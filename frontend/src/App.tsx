import { useState, useRef, useEffect } from 'react';
import YouTube, { YouTubePlayer, YouTubeEvent } from 'react-youtube';

// Define interfaces for our data structures
interface Sentence {
  text: string;
  start: number;
  end: number;
}

interface PlayerData {
  videoId: string;
  sentences: Sentence[];
}

function App() {
  const [url, setUrl] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [playerData, setPlayerData] = useState<PlayerData | null>(null);

  const [activeSentenceIndex, setActiveSentenceIndex] = useState<number | null>(null);
  const [selectionRange, setSelectionRange] = useState<{ start: number | null; end: number | null }>({ start: null, end: null });
  const playerRef = useRef<YouTubePlayer | null>(null);
  const loopIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    setPlayerData(null);
    setActiveSentenceIndex(null);
    setSelectionRange({ start: null, end: null });

    try {
      const response = await fetch('http://127.0.0.1:5000/process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ video_url: url }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || '서버에서 오류가 발생했습니다.');
      }

      const data: PlayerData = await response.json();
      setPlayerData(data);

    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const stopLoop = () => {
    if (loopIntervalRef.current) {
      clearInterval(loopIntervalRef.current);
      loopIntervalRef.current = null;
    }
  };

  const handleSentenceClick = (sentence: Sentence, index: number, event: React.MouseEvent) => {
    if (!playerRef.current) return;
    stopLoop();

    if (event.shiftKey && activeSentenceIndex !== null) {
        const newStart = Math.min(activeSentenceIndex, index);
        const newEnd = Math.max(activeSentenceIndex, index);
        setSelectionRange({ start: newStart, end: newEnd });
        // We don't start playback here, just select the range.
    } else {
        // Regular click: play single sentence
        setSelectionRange({ start: null, end: null }); // Clear multi-selection
        setActiveSentenceIndex(index);
        const player = playerRef.current;
        player.seekTo(sentence.start, true);
        player.playVideo();

        loopIntervalRef.current = setInterval(() => {
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

    const startSentence = playerData.sentences[selectionRange.start];
    const endSentence = playerData.sentences[selectionRange.end];

    const startTime = startSentence.start;
    const endTime = endSentence.end;

    const player = playerRef.current;
    player.seekTo(startTime, true);
    player.playVideo();

    loopIntervalRef.current = setInterval(() => {
        const currentTime = player.getCurrentTime();
        // If current time goes past the end of the selection, loop back to the start
        if (currentTime >= endTime) {
            player.seekTo(startTime, true);
        }
    }, 200);
  };


  // Stop loop when player is paused or ends
  const onPlayerStateChange = (event: YouTubeEvent) => {
    if (event.data === YouTube.PlayerState.PAUSED || event.data === YouTube.PlayerState.ENDED) {
      stopLoop();
    }
  };
  
  // Cleanup interval on component unmount
  useEffect(() => {
    return () => stopLoop();
  }, []);

  const renderContent = () => {
    if (isLoading) {
      return <div className="status">처리 중... 오디오 및 자막 추출에는 몇 분 정도 소요될 수 있습니다. 잠시만 기다려주세요...</div>;
    }
    if (error) {
      return <div className="status error">오류: {error}</div>;
    }
    if (playerData) {
      const isSelectionActive = selectionRange.start !== null;
      return (
        <div className="player-container">
          <YouTube
            videoId={playerData.videoId}
            opts={{ width: '100%', height: '480' }}
            onReady={(e: YouTubeEvent) => (playerRef.current = e.target)}
            onStateChange={onPlayerStateChange}
          />
          <div className="controls">
            {isSelectionActive && (
              <button onClick={playSelection}>선택 구간 반복</button>
            )}
            <button onClick={stopLoop}>반복 중지</button>
          </div>
          <div className="sentence-list">
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
    }
    return null; // Initial state, nothing to show below the form
  };

  return (
    <div className="App">
      <h2>쉐도잉 영상 추출 및 연습</h2>
      {!playerData && (
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=..."
            required
          />
          <button type="submit" disabled={isLoading}>추출 시작</button>
        </form>
      )}
      {renderContent()}
    </div>
  );
}

export default App;
