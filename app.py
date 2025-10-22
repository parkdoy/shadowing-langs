from flask import Flask, request, jsonify, Response, send_from_directory
from flask_cors import CORS
import os
import json
import subprocess
import nltk
from yt_dlp import YoutubeDL
import time

# Flask 앱 생성 및 CORS 설정
app = Flask(__name__)
CORS(app) # 모든 라우트에 대해 CORS를 허용

OUTPUT_DIR = "output"

# --- Flask API Routes ---

@app.route("/process", methods=["POST"])
def process():
    """URL을 받아 모든 처리과정을 스트리밍으로 실행하고, 진행상황과 결과 데이터를 SSE로 전송합니다."""
    video_url = request.json.get("video_url")
    if not video_url:
        return jsonify({"error": "No URL provided"}), 400

    def generate_progress():
        try:
            # --- 1. 오디오 및 자막 추출 ---
            yield f'data: {json.dumps({"progress": 5, "message": "오디오 및 자막 추출 시작..."})}\n\n'
            os.makedirs(OUTPUT_DIR, exist_ok=True)

            # 오디오 다운로드
            ydl_opts = {
                'format': 'bestaudio/best',
                'outtmpl': os.path.join(OUTPUT_DIR, 'audio.%(ext)s'),
                'postprocessors': [{'key': 'FFmpegExtractAudio', 'preferredcodec': 'mp3'}],
                'quiet': True,
            }
            with YoutubeDL(ydl_opts) as ydl:
                ydl.download([video_url])
            yield f'data: {json.dumps({"progress": 25, "message": "오디오 다운로드 완료"})}\n\n'

            # 자막 다운로드
            transcript_filename_base = os.path.join(OUTPUT_DIR, 'transcript')
            transcript_filename_json3 = f'{transcript_filename_base}.en.json3'
            final_transcript_filename = os.path.join(OUTPUT_DIR, 'transcript.json')

            command = ['yt-dlp', '--write-auto-sub', '--sub-lang', 'en', '--sub-format', 'json3', '--skip-download', '-o', transcript_filename_base, video_url]
            subprocess.run(command, check=True, capture_output=True)

            if os.path.exists(transcript_filename_json3):
                if os.path.exists(final_transcript_filename):
                    os.remove(final_transcript_filename)
                os.rename(transcript_filename_json3, final_transcript_filename)
            else:
                raise Exception("영상에 자동 생성 영어 자막이 없는 것 같습니다.")
            
            yield f'data: {json.dumps({"progress": 50, "message": "자막 다운로드 완료, 문장 분리 시작..."})}\n\n'
            time.sleep(1)

            # --- 2. 문장 분리 ---
            nltk.download('punkt', quiet=True)
            transcript_path = os.path.join(OUTPUT_DIR, "transcript.json")
            with open(transcript_path, "r", encoding="utf-8") as f:
                raw_data = json.load(f)

            events = raw_data.get("events", [])
            if not events:
                raise Exception("자막 파일에서 이벤트 데이터를 찾을 수 없습니다.")

            total_events = len(events)
            sentences = []
            
            for i, event in enumerate(events):
                if not event or 'segs' not in event:
                    continue
                
                text_parts = [seg.get('utf8', '') for seg in event['segs']]
                text = ''.join(text_parts).replace('\n', ' ').strip()
                start_time = event.get('tStartMs', 0) / 1000.0
                
                for sent in nltk.tokenize.sent_tokenize(text):
                    sentences.append({"text": sent, "start": start_time})

                # 진행률 업데이트 (50% ~ 95%)
                progress = 50 + int(((i + 1) / total_events) * 45)
                yield f'data: {json.dumps({"progress": progress, "message": f"문장 분석 중... ({i+1}/{total_events})"})}\n\n'

            # 문장 종료 시간 계산
            for i in range(len(sentences) - 1):
                if sentences[i+1]["start"] > sentences[i]["start"]:
                    sentences[i]["end"] = sentences[i+1]["start"]
                else:
                    # 다음 문장과 시작 시간이 같으면, 임의로 2초를 더해줌
                    sentences[i]["end"] = sentences[i]["start"] + 2.0

            if sentences:
                last_start = sentences[-1]["start"]
                last_event_duration = 5.0 # 기본 지속시간
                if events and 'dDurationMs' in events[-1]:
                    last_event_duration = events[-1]['dDurationMs'] / 1000.0
                sentences[-1]["end"] = last_start + last_event_duration

            yield f'data: {json.dumps({"progress": 99, "message": "최종 데이터 준비 중..."})}\n\n'
            time.sleep(1)

            # --- 3. 최종 데이터 반환 ---
            with YoutubeDL({'quiet': True}) as ydl:
                info_dict = ydl.extract_info(video_url, download=False)
                video_id = info_dict.get("id")
                video_title = info_dict.get('title', 'video')
                # Sanitize title for filename
                safe_title = "".join([c for c in video_title if c.isalpha() or c.isdigit()]).rstrip()
                if not safe_title:
                    safe_title = "video"
                output_filename = os.path.join(OUTPUT_DIR, f"{safe_title}_{video_id}.json")

            final_data = {
                "videoId": video_id,
                "sentences": sentences,
                "title": video_title
            }

            # Save final data to file
            with open(output_filename, 'w', encoding='utf-8') as f:
                json.dump(final_data, f, ensure_ascii=False, indent=4)
            
            final_data_with_filename = {**final_data, "filename": output_filename}

            yield f'data: {json.dumps({"progress": 100, "message": "완료!", "final_data": final_data_with_filename})}\n\n'

        except Exception as e:
            error_message = str(e)
            if isinstance(e, subprocess.CalledProcessError):
                error_message = e.stderr.decode('utf-8', errors='ignore')
            app.logger.error(f"Error during processing: {error_message}")
            yield f'data: {json.dumps({"error": error_message})}\n\n'

    return Response(generate_progress(), mimetype='text/event-stream')

@app.route("/api/output-files")
def list_output_files():
    """output 디렉토리에 있는 .json 파일 목록을 반환합니다."""
    if not os.path.exists(OUTPUT_DIR):
        os.makedirs(OUTPUT_DIR)
    files = [f for f in os.listdir(OUTPUT_DIR) if f.endswith('.json')]
    return jsonify(files)

@app.route('/output/<path:filename>')
def serve_output_file(filename):
    """output 디렉토리의 파일을 제공합니다."""
    return send_from_directory(OUTPUT_DIR, filename)

@app.route("/audio.mp3")
def audio_file():
    """생성된 audio.mp3 파일을 제공합니다."""
    return send_from_directory(OUTPUT_DIR, 'audio.mp3')

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)