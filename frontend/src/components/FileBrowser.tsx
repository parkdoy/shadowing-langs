// src/components/FileBrowser.tsx
import React from 'react';

interface FileBrowserProps {
  outputFiles: string[];
  onFileClick: (filename: string) => void;
  isLoading: boolean;
}

export const FileBrowser: React.FC<FileBrowserProps> = ({ outputFiles, onFileClick, isLoading }) => {
  if (outputFiles.length === 0) {
    return null;
  }

  return (
    <div className="output-files">
      <h4>또는 기존 파일 불러오기:</h4>
      <ul>
        {outputFiles
          .filter(file => !file.toLowerCase().includes('transcript'))
          .map((file) => (
            <li 
              key={file} 
              onClick={() => !isLoading && onFileClick(file)} 
              style={{ 
                cursor: isLoading ? 'not-allowed' : 'pointer', 
                color: isLoading ? '#888' : '#007bff' 
              }}
            >
              {file.replace(/_[a-zA-Z0-9-]{11}\.json$/, '')}
            </li>
          ))}
      </ul>
    </div>
  );
};
