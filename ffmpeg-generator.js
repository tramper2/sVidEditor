/**
 * sVidEditor - FFmpeg Command & Batch Script Generator
 * 
 * 이 모듈은 웹 타임라인의 편집 데이터를 분석하여,
 * 로컬 Windows 환경에서 작동하는 FFmpeg 명령어와 실행용 배치(.bat) 파일을 생성합니다.
 */

function generateFFmpegCommand(projectState) {
    const { clips, assets } = projectState;
    
    // 트랙별 클립 분류
    const video1Clips = clips.filter(c => c.track === 'video1').sort((a, b) => a.timelineStart - b.timelineStart);
    const video2Clips = clips.filter(c => c.track === 'video2').sort((a, b) => a.timelineStart - b.timelineStart);
    const audioClips = clips.filter(c => c.track === 'audio').sort((a, b) => a.timelineStart - b.timelineStart);
    const overlayClips = clips.filter(c => c.track === 'overlay').sort((a, b) => a.timelineStart - b.timelineStart);
    
    // 메인 비디오 트랙 1이 비어있으면 명령어를 생성하지 않음
    if (video1Clips.length === 0) {
        return {
            error: "메인 비디오 트랙(Video Track 1)에 최소 하나 이상의 비디오 클립이 존재해야 합니다.",
            command: "",
            batContent: ""
        };
    }

    let inputs = [];
    let filterComplex = [];
    let currentInputIndex = 0;
    
    // 각 클립을 고유한 입력 번호로 매핑 (인풋 시킹 적용)
    // 1. Video Track 1 클립 입력 정의
    const video1Mappings = video1Clips.map((clip, index) => {
        const inputIdx = currentInputIndex++;
        inputs.push(`-ss ${formatTime(clip.sourceStart)} -t ${formatTime(clip.duration)} -i "${clip.localPath}"`);
        return { clip, inputIdx };
    });

    // 2. Video Track 2 (PIP) 클립 입력 정의
    const video2Mappings = video2Clips.map((clip, index) => {
        const inputIdx = currentInputIndex++;
        inputs.push(`-ss ${formatTime(clip.sourceStart)} -t ${formatTime(clip.duration)} -i "${clip.localPath}"`);
        return { clip, inputIdx };
    });

    // 3. Audio (BGM) 클립 입력 정의
    const audioMappings = audioClips.map((clip, index) => {
        const inputIdx = currentInputIndex++;
        inputs.push(`-ss ${formatTime(clip.sourceStart)} -t ${formatTime(clip.duration)} -i "${clip.localPath}"`);
        return { clip, inputIdx };
    });

    // 4. Overlay PNG 이미지 입력 정의 (텍스트 제외한 이미지 클립만)
    const imageClips = overlayClips.filter(c => c.overlayType === 'image');
    const imageMappings = imageClips.map((clip, index) => {
        const inputIdx = currentInputIndex++;
        inputs.push(`-i "${clip.localPath}"`);
        return { clip, inputIdx };
    });

    // --- 필터 복합체 (Filter Complex) 생성 ---
    
    // 1단계: Video Track 1 클립들을 720p 60fps로 규격화하고 개별 효과 적용
    video1Mappings.forEach(({ clip, inputIdx }) => {
        let vFilters = [];
        
        // 1. 영상 회전 (transpose)
        if (clip.rotation === 90) {
            vFilters.push("transpose=1");
        } else if (clip.rotation === 180) {
            vFilters.push("transpose=1,transpose=1");
        } else if (clip.rotation === 270) {
            vFilters.push("transpose=2");
        }
        
        // 2. 스케일 및 레터박스 패딩 (서로 다른 크기의 영상을 1280x720 규격으로 패딩 처리)
        // 회전 후 해상도가 바뀔 수 있으므로 transpose 후에 스케일을 적용합니다.
        vFilters.push("scale=w='if(gte(iw/ih,1280/720),1280,-1)':h='if(gte(iw/ih,1280/720),-1,720)'");
        vFilters.push("pad=1280:720:(1280-iw)/2:(720-ih)/2:black");
        vFilters.push("setsar=1");
        vFilters.push("fps=60");
        
        // 3. 비디오 효과 처리
        if (clip.effects && clip.effects.length > 0) {
            clip.effects.forEach(effect => {
                if (effect === 'grayscale') {
                    vFilters.push("hue=s=0");
                } else if (effect === 'sepia') {
                    vFilters.push("colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131");
                } else if (effect === 'reverse') {
                    vFilters.push("reverse");
                } else if (effect === 'zoom_in') {
                    // 안전한 줌인 효과 (가운데 기준 크롭)
                    vFilters.push("scale=1.3*iw:1.3*ih", "crop=1280:720");
                } else if (effect === 'zoom_out') {
                    // 안전한 줌아웃 효과 (축소 후 패딩)
                    vFilters.push("scale=0.8*iw:0.8*ih", "pad=1280:720:(1280-iw)/2:(720-ih)/2:black");
                }
            });
        }
        
        // 4. 오디오 필터 처리
        let aFilters = [];
        aFilters.push(`volume=${clip.volume !== undefined ? clip.volume : 1.0}`);
        aFilters.push("aresample=44100");
        
        if (clip.effects && clip.effects.includes('reverse')) {
            aFilters.push("areverse");
        }
        
        filterComplex.push(`[${inputIdx}:v]${vFilters.join(',')}[v1_${inputIdx}]`);
        filterComplex.push(`[${inputIdx}:a]${aFilters.join(',')}[a1_${inputIdx}]`);
    });

    // 2단계: Video Track 1 클립들 순차 합치기 (Concatenation)
    let concatInV = video1Mappings.map(m => `[v1_${m.inputIdx}]`).join('');
    let concatInA = video1Mappings.map(m => `[a1_${m.inputIdx}]`).join('');
    filterComplex.push(`${concatInV}${concatInA}concat=n=${video1Clips.length}:v=1:a=1[v_track1][a_track1]`);

    let currentVideoStream = "[v_track1]";
    let audioStreamsToMix = ["[a_track1]"];

    // 3단계: Video Track 2 (PIP/오버레이) 합성
    video2Mappings.forEach(({ clip, inputIdx }) => {
        // PIP 비디오 스케일링 및 효과
        let pipVFilters = [];
        const pipW = clip.pip?.width || 320;
        const pipH = clip.pip?.height || 180;
        const pipX = clip.pip?.x || 20;
        const pipY = clip.pip?.y || 20;
        
        pipVFilters.push(`scale=${pipW}:${pipH}`);
        pipVFilters.push("setsar=1");
        pipVFilters.push("fps=60");
        
        if (clip.effects && clip.effects.length > 0) {
            clip.effects.forEach(effect => {
                if (effect === 'grayscale') pipVFilters.push("hue=s=0");
                else if (effect === 'sepia') pipVFilters.push("colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131");
                else if (effect === 'reverse') pipVFilters.push("reverse");
            });
        }
        
        filterComplex.push(`[${inputIdx}:v]${pipVFilters.join(',')}[v2_processed_${inputIdx}]`);
        
        // 메인 트랙에 오버레이
        const tStart = clip.timelineStart;
        const tEnd = clip.timelineStart + clip.duration;
        const nextVStream = `[v_overlay_${inputIdx}]`;
        
        filterComplex.push(`${currentVideoStream}[v2_processed_${inputIdx}]overlay=x=${pipX}:y=${pipY}:enable='between(t,${tStart},${tEnd})'${nextVStream}`);
        currentVideoStream = nextVStream;
        
        // PIP 오디오 처리 및 시간 지연(adelay) 적용
        let pipAFilters = [];
        pipAFilters.push(`volume=${clip.volume !== undefined ? clip.volume : 1.0}`);
        pipAFilters.push("aresample=44100");
        if (clip.effects && clip.effects.includes('reverse')) {
            pipAFilters.push("areverse");
        }
        
        const delayMs = Math.round(tStart * 1000);
        pipAFilters.push(`adelay=${delayMs}|${delayMs}`);
        
        filterComplex.push(`[${inputIdx}:a]${pipAFilters.join(',')}[a2_delayed_${inputIdx}]`);
        audioStreamsToMix.push(`[a2_delayed_${inputIdx}]`);
    });

    // 4단계: 배경 오디오(BGM) 추가 및 지연 적용
    audioMappings.forEach(({ clip, inputIdx }) => {
        let bgmAFilters = [];
        bgmAFilters.push(`volume=${clip.volume !== undefined ? clip.volume : 1.0}`);
        bgmAFilters.push("aresample=44100");
        
        const delayMs = Math.round(clip.timelineStart * 1000);
        bgmAFilters.push(`adelay=${delayMs}|${delayMs}`);
        
        filterComplex.push(`[${inputIdx}:a]${bgmAFilters.join(',')}[bgm_delayed_${inputIdx}]`);
        audioStreamsToMix.push(`[bgm_delayed_${inputIdx}]`);
    });

    // 5단계: PNG 이미지 오버레이 합성
    imageMappings.forEach(({ clip, inputIdx }) => {
        let imgW = clip.width || 150;
        let imgH = clip.height || 150;
        let imgX = clip.x || 100;
        let imgY = clip.y || 100;
        
        filterComplex.push(`[${inputIdx}:v]scale=${imgW}:${imgH},setsar=1[img_${inputIdx}]`);
        
        const tStart = clip.timelineStart;
        const tEnd = clip.timelineStart + clip.duration;
        const nextVStream = `[v_img_overlay_${inputIdx}]`;
        
        filterComplex.push(`${currentVideoStream}[img_${inputIdx}]overlay=x=${imgX}:y=${imgY}:enable='between(t,${tStart},${tEnd})'${nextVStream}`);
        currentVideoStream = nextVStream;
    });

    // 6단계: 자막 텍스트(drawtext) 필터 추가
    const textClips = overlayClips.filter(c => c.overlayType === 'text');
    textClips.forEach((clip, index) => {
        const text = clip.text ? clip.text.replace(/'/g, "'\\''").replace(/:/g, "\\:") : "";
        const size = clip.textSize || 36;
        const color = clip.textColor || "#ffffff";
        const x = clip.x !== undefined ? clip.x : 640;
        const y = clip.y !== undefined ? clip.y : 600;
        const tStart = clip.timelineStart;
        const tEnd = clip.timelineStart + clip.duration;
        
        // drawtext 필터에서 텍스트 정중앙 정렬 처리를 위해 x 식 수정
        // (w-text_w)/2 를 쓰거나 입력받은 특정 X좌표 기준으로 배치
        // 사용자가 명시적으로 640(정중앙 기본값)을 지정한 경우 화면 가로 중앙 정렬 적용
        let xExpr = `${x}`;
        if (x === 640) {
            xExpr = `(w-text_w)/2`;
        }
        
        const nextVStream = `[v_text_overlay_${index}]`;
        
        // Windows 환경 폰트 설정 (arial.ttf 기본 탑재 사용)
        filterComplex.push(`${currentVideoStream}drawtext=text='${text}':x=${xExpr}:y=${y}:fontsize=${size}:fontcolor=${color}:box=1:boxcolor=black@0.4:fontfile='C\\:/Windows/Fonts/arial.ttf':enable='between(t,${tStart},${tEnd})'${nextVStream}`);
        currentVideoStream = nextVStream;
    });

    // 최종 비디오 출력 매핑 태그 설정
    const finalVideoStream = currentVideoStream;

    // 7단계: 오디오 믹싱 (amix)
    let finalAudioStream = "[a_track1]";
    if (audioStreamsToMix.length > 1) {
        const inputCount = audioStreamsToMix.length;
        const mixStream = "[a_mixed]";
        // duration=first로 설정하여 메인 비디오 트랙1 길이 기준으로 오디오를 자름
        filterComplex.push(`${audioStreamsToMix.join('')}amix=inputs=${inputCount}:duration=first:dropout_transition=2${mixStream}`);
        finalAudioStream = mixStream;
    }

    // --- 최종 명령어 및 배치 파일 패키징 ---
    
    // filter_complex 끝 부분 임시 태그 치환
    let filterString = filterComplex.join(';');
    
    // 최종 매핑 지정
    let mappedVideo = finalVideoStream;
    let mappedAudio = finalAudioStream;
    
    // ffmpeg 명령어 조합
    let cmdParts = [];
    cmdParts.push("ffmpeg");
    cmdParts.push("-y");
    cmdParts.push(inputs.join(" "));
    cmdParts.push(`-filter_complex "${filterString}"`);
    cmdParts.push(`-map "${mappedVideo}"`);
    cmdParts.push(`-map "${mappedAudio}"`);
    cmdParts.push("-c:v libx264 -pix_fmt yuv420p -r 60 -c:a aac -b:a 192k -ar 44100");
    
    const outputFilename = `output\\rendered_${formatDateForFilename(new Date())}.mp4`;
    cmdParts.push(`"${outputFilename}"`);
    
    const fullCommand = cmdParts.join(" ");

    // 윈도우 배치 파일 (.bat) 내용 생성
    const batContent = `@echo off
chcp 65001 > nul
title sVidEditor - 로컬 렌더러 실행기
echo =====================================================================
echo  sVidEditor 동영상 렌더링 작업을 시작합니다.
echo =====================================================================
echo.

:: 1. 로컬 환경 ffmpeg 경로 점검
set FFMPEG_BIN=ffmpeg.exe
if exist "ffmpeg\\ffmpeg.exe" (
    set FFMPEG_BIN="ffmpeg\\ffmpeg.exe"
    echo [정보] 로컬 하위폴더 'ffmpeg' 내의 FFMPEG 바이너리를 사용합니다.
) else (
    :: 시스템 패스 검증
    where ffmpeg >nul 2>nul
    if %errorlevel% equ 0 (
        set FFMPEG_BIN=ffmpeg
        echo [정보] 시스템 환경변수(PATH)에 등록된 FFMPEG를 사용합니다.
    ) else (
        echo [오류] ffmpeg.exe를 찾을 수 없습니다!
        echo D:\\Study\\WebPage\\sVidEditor\\ffmpeg\\ 폴더에 ffmpeg.exe를 넣거나
        echo 시스템 환경 변수에 등록한 후 다시 실행해 주세요.
        echo.
        echo 안내서를 확인하려면 ffmpeg\\README.txt 파일을 열어보세요.
        pause
        exit /b 1
    )
)

:: 2. 출력 디렉터리 검증 및 생성
if not exist "output" (
    mkdir "output"
    echo [정보] 출력 폴더 'output'을 생성했습니다.
)

echo.
echo [실행] 인코딩 인풋 설정 및 필터 복합체를 빌드하여 렌더링을 시작합니다...
echo.

:: 3. FFmpeg 실행
%FFMPEG_BIN% -y ${inputs.join(" ")} -filter_complex "${filterString.replace(/"/g, '\"')}" -map "${mappedVideo}" -map "${mappedAudio}" -c:v libx264 -pix_fmt yuv420p -r 60 -c:a aac -b:a 192k -ar 44100 "${outputFilename}"

if %errorlevel% equ 0 (
    echo.
    echo =====================================================================
    echo [성공] 렌더링 완료!
    echo 저장 위치: ${outputFilename}
    echo =====================================================================
) else (
    echo.
    echo =====================================================================
    echo [오류] 렌더링 도중 문제가 발생했습니다. (에러 코드: %errorlevel%)
    echo 파일 경로가 올바른지, 코덱 오류인지 로그를 확인해 주세요.
    echo =====================================================================
)

pause
`;

    return {
        command: fullCommand,
        batContent: batContent,
        outputFile: outputFilename
    };
}

/**
 * 초 단위를 HH:MM:SS.mmm 포맷 문자열로 변환
 */
function formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return "00:00:00.000";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.round((seconds % 1) * 1000);
    
    return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)}.${pad(ms, 3)}`;
}

function pad(num, size) {
    let s = num + "";
    while (s.length < size) s = "0" + s;
    return s;
}

function formatDateForFilename(date) {
    const y = date.getFullYear();
    const m = pad(date.getMonth() + 1, 2);
    const d = pad(date.getDate(), 2);
    const hh = pad(date.getHours(), 2);
    const mm = pad(date.getMinutes(), 2);
    const ss = pad(date.getSeconds(), 2);
    return `${y}${m}${d}_${hh}${mm}${ss}`;
}
