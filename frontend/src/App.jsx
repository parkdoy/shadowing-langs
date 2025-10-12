import { useState, useRef, useEffect } from 'react';
import YouTube from 'react-youtube';

function App() {
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [playerData, setPlayerData] = useState(null); // { videoId, sentences }

  const [activeSentenceIndex, setActiveSentenceIndex] = useState(null);
  const playerRef = useRef(null);
  const loopIntervalRef = useRef(null);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    setPlayerData(null);

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

      const data = await response.json();
      setPlayerData(data);

    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSentenceClick = (sentence, index) => {
    if (!playerRef.current) return;

    // Clear previous loop
    if (loopIntervalRef.current) {
      clearInterval(loopIntervalRef.current);
    }

    setActiveSentenceIndex(index);
    const player = playerRef.current; // 수정된 부분
    player.seekTo(sentence.start, true);
    player.playVideo();

    // Set up new loop
    loopIntervalRef.current = setInterval(() => {
      const currentTime = player.getCurrentTime();
      if (currentTime >= sentence.end) {
        player.seekTo(sentence.start, true);
      }
    }, 200);
  };

  const stopLoop = () => {
    if (loopIntervalRef.current) {
      clearInterval(loopIntervalRef.current);
      loopIntervalRef.current = null;
    }
  };

  // Stop loop when player is paused or ends
  const onPlayerStateChange = (event) => {
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
      return (
        <div className="player-container">
          <YouTube
            videoId={playerData.videoId}
            opts={{ width: '100%', height: '480' }}
            onReady={(e) => (playerRef.current = e.target)}
            onStateChange={onPlayerStateChange}
          />
          <div className="sentence-list">
            {playerData.sentences.map((sentence, index) => (
              <div
                key={index}
                className={`sentence ${index === activeSentenceIndex ? 'active' : ''}`}
                onClick={() => handleSentenceClick(sentence, index)}
              >
                {sentence.text}
              </div>
            ))}
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