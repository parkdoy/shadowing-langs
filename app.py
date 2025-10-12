from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import os
import json
import subprocess
import nltk
from yt_dlp import YoutubeDL

# Flask 앱 생성 및 CORS 설정
app = Flask(__name__)
CORS(app) # 모든 라우트에 대해 CORS를 허용

OUTPUT_DIR = "output"

# --- 처리 로직 함수 ---

def extract_data(video_url):
    """1. 오디오 및 자막 추출"""
    print("--- 1/2: 오디오 및 자막 추출 시작 ---")
    os.makedirs(OUTPUT_DIR, exist_ok=True) # output 폴더가 없으면 생성
    try:
        # 오디오 다운로드
        ydl_opts = {
            'format': 'bestaudio/best',
            'outtmpl': os.path.join(OUTPUT_DIR, 'audio.%(ext)s'),
            'postprocessors': [{'key': 'FFmpegExtractAudio', 'preferredcodec': 'mp3'}],
            'quiet': True,
        }
        with YoutubeDL(ydl_opts) as ydl:
            ydl.download([video_url])
        print("✅ 오디오 파일(audio.mp3) 다운로드 성공")

        # 자막 다운로드 (yt-dlp 사용)
        transcript_filename_base = os.path.join(OUTPUT_DIR, 'transcript')
        transcript_filename_json3 = f'{transcript_filename_base}.en.json3'
        final_transcript_filename = os.path.join(OUTPUT_DIR, 'transcript.json')

        command = ['yt-dlp', '--write-auto-sub', '--sub-lang', 'en', '--sub-format', 'json3', '--skip-download', '-o', transcript_filename_base, video_url]
        subprocess.run(command, check=True, capture_output=True)

        if os.path.exists(transcript_filename_json3):
            if os.path.exists(final_transcript_filename):
                os.remove(final_transcript_filename)
            os.rename(transcript_filename_json3, final_transcript_filename)
            print(f"✅ 자막 파일({final_transcript_filename}) 다운로드 성공")
            return True
        else:
            print(f"❌ FAILED: 영상에 자동 생성 영어 자막이 없는 것 같습니다.")
            return False
    except Exception as e:
        print(f"❌ 데이터 추출 중 오류 발생: {e}")
        if isinstance(e, subprocess.CalledProcessError):
            print(f"Stderr: {e.stderr.decode('utf-8', errors='ignore')}")
        return False

def separate_sentences():
    """2. 문장 분리"""
    print("\n--- 2/2: 문장 분리 시작 ---")
    try:
        nltk.download('punkt', quiet=True)
        nltk.download('punkt_tab', quiet=True)
        
        transcript_path = os.path.join(OUTPUT_DIR, "transcript.json")
        sentences_path = os.path.join(OUTPUT_DIR, "sentences.json")

        with open(transcript_path, "r", encoding="utf-8") as f:
            raw_data = json.load(f)

        sentences = []
        events = raw_data.get("events", [])
        for event in events:
            if not event or 'segs' not in event:
                continue
            
            text_parts = [seg.get('utf8', '') for seg in event['segs']]
            text = ''.join(text_parts).replace('\n', ' ').strip()
            start_time = event.get('tStartMs', 0) / 1000.0
            for sent in nltk.tokenize.sent_tokenize(text):
                sentences.append({"text": sent, "start": start_time})

        for i in range(len(sentences) - 1):
            if sentences[i+1]["start"] > sentences[i]["start"]:
                sentences[i]["end"] = sentences[i+1]["start"]
            else:
                sentences[i]["end"] = sentences[i]["start"] + 2.0

        if sentences:
            last_start = sentences[-1]["start"]
            last_event_duration = 5.0
            if events and 'dDurationMs' in events[-1]:
                last_event_duration = events[-1]['dDurationMs'] / 1000.0
            sentences[-1]["end"] = last_start + last_event_duration

        with open(sentences_path, "w", encoding="utf-8") as f:
            json.dump(sentences, f, ensure_ascii=False, indent=2)
        
        print("✅ 문장 분리 성공 (sentences.json 생성)")
        return True
    except Exception as e:
        print(f"❌ 문장 분리 중 오류 발생: {e}")
        return False

# --- Flask API Routes ---

@app.route("/process", methods=["POST"])
def process():
    """URL을 받아 모든 처리과정을 실행하고, 결과 데이터를 JSON으로 반환합니다."""
    video_url = request.json.get("video_url")
    if not video_url:
        return jsonify({"error": "No URL provided"}), 400
    
    if not extract_data(video_url):
        return jsonify({"error": "Failed to extract data. Check server logs."} ), 500
    
    if not separate_sentences():
        return jsonify({"error": "Failed to separate sentences. Check server logs."} ), 500

    # 모든 처리가 성공하면, video_id와 sentences.json 내용을 반환
    try:
        with YoutubeDL({'quiet': True}) as ydl:
            info_dict = ydl.extract_info(video_url, download=False)
            video_id = info_dict.get("id")
        
        sentences_path = os.path.join(OUTPUT_DIR, "sentences.json")
        with open(sentences_path, "r", encoding="utf-8") as f:
            sentences_data = json.load(f)
        
        return jsonify({
            "videoId": video_id,
            "sentences": sentences_data
        })
    except Exception as e:
        print(f"❌ 최종 데이터 반환 중 오류: {e}")
        return jsonify({"error": "Failed to prepare final data. Check server logs."} ), 500

@app.route("/audio.mp3")
def audio_file():
    """생성된 audio.mp3 파일을 제공합니다."""
    return send_from_directory(OUTPUT_DIR, 'audio.mp3')

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
