// src/App.tsx
import { useState, useEffect } from 'react';
import { PlayerData } from './types';
import { processVideo, loadOutputFile, getOutputFiles } from './services/api';
import { UrlForm } from './components/UrlForm';
import { FileBrowser } from './components/FileBrowser';
import { PlayerView } from './components/PlayerView';
import './index.css'; // Ensure styles are imported

function App() {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [playerData, setPlayerData] = useState<PlayerData | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [progressMessage, setProgressMessage] = useState<string>('');
  const [outputFiles, setOutputFiles] = useState<string[]>([]);

  const fetchFiles = () => {
    getOutputFiles()
      .then(setOutputFiles)
      .catch(err => {
        console.error("Error fetching output files:", err);
        setError('저장된 파일 목록을 불러오는 데 실패했습니다.');
      });
  };

  useEffect(() => {
    fetchFiles();
  }, []);

  const resetForLoading = () => {
    setIsLoading(true);
    setError(null);
    setPlayerData(null);
    setProgress(0);
    setProgressMessage('');
  };

  const handleProcessSubmit = async (url: string) => {
    resetForLoading();
    try {
      const data = await processVideo(url, (prog, msg) => {
        setProgress(prog);
        setProgressMessage(msg);
      });
      setPlayerData(data);
      fetchFiles(); // Refresh file list after processing
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileLoad = async (filename: string) => {
    resetForLoading();
    try {
      const data = await loadOutputFile(filename);
      setPlayerData(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const renderInitialView = () => (
    <>
      <UrlForm onSubmit={handleProcessSubmit} isLoading={isLoading} />
      {isLoading && (
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
      )}
      <FileBrowser outputFiles={outputFiles} onFileClick={handleFileLoad} isLoading={isLoading} />
    </>
  );

  return (
    <div className="App">
      <h2>쉐도잉 영상 추출 및 연습</h2>
      {error && <div className="status error">오류: {error}</div>}
      {playerData ? <PlayerView playerData={playerData} /> : renderInitialView()}
    </div>
  );
}

export default App;