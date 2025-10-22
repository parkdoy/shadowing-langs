import { useState, useRef, useEffect } from 'react';
import YouTube, { YouTubePlayer, YouTubeEvent } from 'react-youtube';

// Define interfaces for our data structures
interface Sentence {
  text: string;
  start: number;
  end: number;
}

interface PlayerData {
  originalUrl: string; // 원본 YouTube URL 추가
  videoId: string;
  sentences: Sentence[];
  title?: string;
}

function App() {
  const [url, setUrl] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [playerData, setPlayerData] = useState<PlayerData | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [progressMessage, setProgressMessage] = useState<string>('');
  const [outputFiles, setOutputFiles] = useState<string[]>([]);

  const [activeSentenceIndex, setActiveSentenceIndex] = useState<number | null>(null);
  const [selectionRange, setSelectionRange] = useState<{ start: number | null; end: number | null }>({ start: null, end: null });
  const [selectionProgress, setSelectionProgress] = useState(0);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const loopIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    fetch('http://127.0.0.1:5000/api/output-files')
      .then(res => res.json())
      .then(files => setOutputFiles(files))
      .catch(err => console.error("Error fetching output files:", err));
  }, []);

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

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    setPlayerData(null);
    setActiveSentenceIndex(null);
    setSelectionRange({ start: null, end: null });
    setProgress(0);
    setProgressMessage('');

    try {
      const response = await fetch('http://127.0.0.1:5000/process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ video_url: url }),
      });

      if (!response.body) {
        throw new Error('Response body is null');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let partialLine = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
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
                throw new Error(data.error);
              }
              if (data.progress) {
                setProgress(data.progress);
              }
              if (data.message) {
                setProgressMessage(data.message);
              }
              if (data.final_data) {
                setPlayerData(data.final_data);
                setIsLoading(false);
                // Refetch files after processing is complete
                fetch('http://127.0.0.1:5000/api/output-files')
                  .then(res => res.json())
                  .then(files => setOutputFiles(files));
              }
            }
          }
        }
      }

    } catch (err) {
      setError((err as Error).message);
      setIsLoading(false);
    }
  };

  const handleFileClick = async (filename: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`http://127.0.0.1:5000/output/${filename}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch ${filename}`);
      }
      const rawData = await response.json();
      let processedData: PlayerData;

      // Attempt to extract videoId from filename
      const videoIdMatch = filename.match(/_([a-zA-Z0-9-]{11})\.json$/);
      const videoId = videoIdMatch ? videoIdMatch[1] : 'unknown'; // Default to 'unknown' if not found

      if (Array.isArray(rawData) && rawData.every((item: any) => 'text' in item && 'start' in item && 'end' in item)) {
        // If rawData is an array of Sentence, construct PlayerData
        // 기존 파일이 Sentence 배열 형식일 경우 originalUrl은 알 수 없으므로 빈 문자열로 초기화
        processedData = {
          originalUrl: '', 
          videoId: videoId,
          sentences: rawData,
          title: filename.replace(/_[a-zA-Z0-9-]{11}\.json$/, '') // Use filename as title
        };
      } else if (typeof rawData === 'object' && rawData !== null && 'videoId' in rawData && 'sentences' in rawData) {
        // If rawData is already PlayerData
        // 기존 파일이 PlayerData 형식일 경우, originalUrl이 없을 수 있으므로 기본값 처리
        processedData = {
          originalUrl: (rawData as any).originalUrl || '', // originalUrl이 없으면 빈 문자열
          ...(rawData as PlayerData) // 나머지 필드는 그대로 사용
        };
      } else {
        throw new Error('Unsupported file format.');
      }
      setPlayerData(processedData);
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
        setActiveSentenceIndex(null); // A range is selected, so no single sentence is active
    } else {
        setSelectionRange({ start: null, end: null });
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
    setActiveSentenceIndex(null);

    const startSentence = playerData.sentences[selectionRange.start];
    const endSentence = playerData.sentences[selectionRange.end];

    const startTime = startSentence.start;
    const endTime = endSentence.end;

    const player = playerRef.current;
    player.seekTo(startTime, true);
    player.playVideo();

    loopIntervalRef.current = setInterval(() => {
        const currentTime = player.getCurrentTime();
        if (currentTime >= endTime) {
            player.seekTo(startTime, true);
        }
    }, 200);
  };

  const onPlayerStateChange = (event: YouTubeEvent) => {
    if (event.data === YouTube.PlayerState.PAUSED || event.data === YouTube.PlayerState.ENDED) {
      stopLoop();
    }
  };
  
  useEffect(() => {
    return () => {
      stopLoop();
    };
  }, []);

  const renderContent = () => {
    if (isLoading && !playerData) { // only show loading screen if there is no player data yet
      return (
        <div className="status">
          <p>{progressMessage || '처리 중...'}</p>
          <progress value={progress} max="100" style={{ width: '100%' }}></progress>
          <p>{progress}%</p>
          {progress < 50 && (
            <p style={{ fontSize: '0.9em', color: '#666' }}>
              오디오 및 자막 추출에는 몇 분 정도 소요될 수 있습니다. 잠시만 기다려주세요...
            </p>
          )}
        </div>
      );
    }
    if (error) {
      return <div className="status error">오류: {error}</div>;
    }
    if (playerData) {
      const isSelectionActive = selectionRange.start !== null;
      return (
        <div className="player-container">
          {playerData.title && <h3>{playerData.title}</h3>}
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
            <div style={{ padding: '10px 0' }}>
              <progress value={selectionProgress} max="100" style={{ width: '100%' }} />
              <span style={{ fontSize: '0.9em' }}>{Math.round(selectionProgress)}%</span>
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
    }
    return null; // Initial state, nothing to show below the form
  };

  return (
    <div className="App">
      <h2>쉐도잉 영상 추출 및 연습</h2>
      {!playerData && (
        <>
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
          {outputFiles.length > 0 && (
            <div className="output-files">
              <h4>또는 기존 파일 불러오기:</h4>
              <ul>
                {outputFiles.map((file) => (
                  <li key={file} onClick={() => handleFileClick(file)} style={{cursor: 'pointer'}}>
                    {file.replace(/_[a-zA-Z0-9-]{11}\.json$/, '')}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
      {renderContent()}
    </div>
  );
}

export default App;
