/**
 * sVidEditor - FFmpeg Command & Batch Script Generator
 * 
 * 이 모듈은 웹 타임라인의 편집 데이터를 분석하여,
 * 로컬 Windows 환경에서 작동하는 FFmpeg 명령어와 실행용 배치(.bat) 파일을 생성합니다.
 */

function getAudioTempoFilter(speed) {
    let filters = [];
    let remaining = speed;
    while (remaining > 2.0) {
        filters.push("atempo=2.0");
        remaining /= 2.0;
    }
    while (remaining < 0.5) {
        filters.push("atempo=0.5");
        remaining /= 0.5;
    }
    if (Math.abs(remaining - 1.0) > 0.01) {
        filters.push(`atempo=${remaining.toFixed(4)}`);
    }
    return filters.join(",");
}

function generateFFmpegCommand(projectState) {
    const { clips, assets } = projectState;
    
    // 사용자가 지정한 출력 해상도 및 FPS 설정 추출 (기본값: 1280x720 60fps)
    const outW = projectState.outputWidth || 1280;
    const outH = projectState.outputHeight || 720;
    const outFPS = projectState.outputFps || 60;
    
    // 16:9 기준 디자인 영역(1280x720)을 실제 출력 해상도(outW x outH)에 맞추어 맞춤(Fit) 영역 및 오프셋 계산
    let activeW, activeH, offsetX, offsetY;
    if (outW / outH >= 16 / 9) {
        // 출력 영상이 더 넓은 경우 (좌우 검은 여백 - Pillarbox)
        activeH = outH;
        activeW = outH * (16 / 9);
        offsetX = (outW - activeW) / 2;
        offsetY = 0;
    } else {
        // 출력 영상이 더 높은 경우 (상하 검은 여백 - Letterbox, 예: 세로 해상도)
        activeW = outW;
        activeH = outW * (9 / 16);
        offsetX = 0;
        offsetY = (outH - activeH) / 2;
    }
    const scale = activeW / 1280;
    
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
        const srcDur = clip.sourceEnd - clip.sourceStart;
        inputs.push(`-ss ${formatTime(clip.sourceStart)} -t ${formatTime(srcDur)} -i "${clip.localPath}"`);
        return { clip, inputIdx };
    });

    // 2. Video Track 2 (PIP) 클립 입력 정의
    const video2Mappings = video2Clips.map((clip, index) => {
        const inputIdx = currentInputIndex++;
        const srcDur = clip.sourceEnd - clip.sourceStart;
        inputs.push(`-ss ${formatTime(clip.sourceStart)} -t ${formatTime(srcDur)} -i "${clip.localPath}"`);
        return { clip, inputIdx };
    });

    // 3. Audio (BGM) 클립 입력 정의
    const audioMappings = audioClips.map((clip, index) => {
        const inputIdx = currentInputIndex++;
        const srcDur = clip.sourceEnd - clip.sourceStart;
        inputs.push(`-ss ${formatTime(clip.sourceStart)} -t ${formatTime(srcDur)} -i "${clip.localPath}"`);
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
    
    // 1단계: Video Track 1 클립들을 지정한 해상도/프레임으로 규격화하고 개별 효과 적용
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
        
        // 2. 스케일 및 레터박스 패딩 (서로 다른 크기의 영상을 사용자 정의 해상도 규격으로 패딩 처리)
        // 회전 후 해상도가 바뀔 수 있으므로 transpose 후에 스케일을 적용합니다.
        vFilters.push(`scale=w='if(gte(iw/ih,${outW}/${outH}),${outW},-1)':h='if(gte(iw/ih,${outW}/${outH}),-1,${outH})'`);
        vFilters.push(`pad=${outW}:${outH}:(${outW}-iw)/2:(${outH}-ih)/2:black`);
        vFilters.push("setsar=1");
        
        if (clip.speed && clip.speed !== 1.0) {
            vFilters.push(`setpts=PTS/${clip.speed}`);
        }
        vFilters.push(`fps=${outFPS}`);
        
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
                    vFilters.push("scale=1.3*iw:1.3*ih", `crop=${outW}:${outH}`);
                } else if (effect === 'zoom_out') {
                    // 안전한 줌아웃 효과 (축소 후 패딩)
                    vFilters.push("scale=0.8*iw:0.8*ih", `pad=${outW}:${outH}:(${outW}-iw)/2:(${outH}-ih)/2:black`);
                }
            });
        }
        
        // 4. 오디오 필터 처리
        let aFilters = [];
        aFilters.push(`volume=${clip.volume !== undefined ? clip.volume : 1.0}`);
        
        if (clip.speed && clip.speed !== 1.0) {
            const atempoFilter = getAudioTempoFilter(clip.speed);
            if (atempoFilter) {
                aFilters.push(atempoFilter);
            }
        }
        aFilters.push("aresample=44100");
        
        if (clip.effects && clip.effects.includes('reverse')) {
            aFilters.push("areverse");
        }
        
        filterComplex.push(`[${inputIdx}:v]${vFilters.join(',')}[v1_${inputIdx}]`);
        filterComplex.push(`[${inputIdx}:a]${aFilters.join(',')}[a1_${inputIdx}]`);
    });

    // 2단계: Video Track 1 클립들 순차 합치기 (Concatenation)
    // FFmpeg concat 필터는 세그먼트별 v,a 쌍 교차 순서 필요: [v0][a0][v1][a1][v2][a2]...
    let concatInputs = video1Mappings.map(m => `[v1_${m.inputIdx}][a1_${m.inputIdx}]`).join('');
    filterComplex.push(`${concatInputs}concat=n=${video1Clips.length}:v=1:a=1[v_track1][a_track1]`);

    let currentVideoStream = "[v_track1]";
    let audioStreamsToMix = ["[a_track1]"];

    // 3단계: Video Track 2 (PIP/오버레이) 합성
    video2Mappings.forEach(({ clip, inputIdx }) => {
        // PIP 비디오 스케일링 및 효과
        let pipVFilters = [];
        const pipW = Math.round((clip.pip?.width !== undefined ? clip.pip.width : 320) * scale);
        const pipH = Math.round((clip.pip?.height !== undefined ? clip.pip.height : 180) * scale);
        const pipX = Math.round((clip.pip?.x !== undefined ? clip.pip.x : 20) * scale + offsetX);
        const pipY = Math.round((clip.pip?.y !== undefined ? clip.pip.y : 20) * scale + offsetY);
        
        pipVFilters.push(`scale=${pipW}:${pipH}`);
        pipVFilters.push("setsar=1");
        
        if (clip.speed && clip.speed !== 1.0) {
            pipVFilters.push(`setpts=PTS/${clip.speed}`);
        }
        pipVFilters.push(`fps=${outFPS}`);
        
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
        
        if (clip.speed && clip.speed !== 1.0) {
            const atempoFilter = getAudioTempoFilter(clip.speed);
            if (atempoFilter) {
                pipAFilters.push(atempoFilter);
            }
        }
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
        let imgW = Math.round((clip.width !== undefined ? clip.width : 150) * scale);
        let imgH = Math.round((clip.height !== undefined ? clip.height : 150) * scale);
        let imgX = Math.round((clip.x !== undefined ? clip.x : 100) * scale + offsetX);
        let imgY = Math.round((clip.y !== undefined ? clip.y : 100) * scale + offsetY);
        
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
        const size = Math.round((clip.textSize || 36) * scale);
        const color = clip.textColor || "#ffffff";
        
        const xVal = clip.x !== undefined ? clip.x : 640;
        const yVal = clip.y !== undefined ? clip.y : 600;
        
        const scaledX = Math.round(xVal * scale + offsetX);
        const scaledY = Math.round(yVal * scale + offsetY);
        
        const tStart = clip.timelineStart;
        const tEnd = clip.timelineStart + clip.duration;
        
        // drawtext 필터에서 텍스트 정중앙 정렬 처리를 위해 x 식 수정
        // (w-text_w)/2 를 쓰거나 입력받은 특정 X좌표 기준으로 배치
        // 사용자가 명시적으로 기존 기본값(640)을 지정했거나, 새로운 해상도의 중앙 좌표(defaultCenterX)인 경우 가로 중앙 정렬 적용
        let xExpr = `${scaledX}`;
        if (xVal === 640) {
            xExpr = `(w-text_w)/2`;
        }
        
        const nextVStream = `[v_text_overlay_${index}]`;
        
        const fontFile = getFFmpegFontPath(clip.textFont, clip.textFontCustom);
        
        // 브라우저 Canvas의 textBaseline = 'middle' (세로 중앙 정렬)과 일치하도록
        // FFmpeg의 Y축 좌표(상단 기준)를 '중앙 좌표 - (글꼴크기 / 2)'로 보정합니다.
        const yExpr = Math.round(scaledY - size / 2);
        
        // Windows 환경 폰트 설정
        filterComplex.push(`${currentVideoStream}drawtext=text='${text}':x=${xExpr}:y=${yExpr}:fontsize=${size}:fontcolor=${color}:box=1:boxcolor=black@0.4:fontfile='${fontFile}':enable='between(t,${tStart},${tEnd})'${nextVStream}`);
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
    // 인코더 선택: GPU(h264_nvenc) 또는 CPU(libx264)
    const encoder = projectState.encoder || 'libx264';
    if (encoder === 'h264_nvenc') {
        // NVIDIA NVENC GPU 인코딩 - p7(최고품질), bitrate 8Mbps
        cmdParts.push(`-c:v h264_nvenc -preset p7 -rc cbr -b:v 8M -pix_fmt yuv420p -r ${outFPS} -c:a aac -b:a 192k -ar 44100`);
    } else {
        // CPU x264 인코딩 - slow 프리셋, CRF 18(고품질)
        cmdParts.push(`-c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -r ${outFPS} -c:a aac -b:a 192k -ar 44100`);
    }
    
    const outputFilename = `output\\rendered_${formatDateForFilename(new Date())}.mp4`;
    cmdParts.push(`"${outputFilename}"`);
    
    const fullCommand = cmdParts.join(" ");

    // 윈도우 배치 파일 (.bat) 내용 생성
    const batContent = `@echo off
chcp 65001 >nul
title sVidEditor - Local Renderer
echo =====================================================================
echo  Starting sVidEditor Video Rendering Task...
echo =====================================================================
echo.

REM 1. Check FFMPEG path
set FFMPEG_BIN=ffmpeg.exe
if exist "ffmpeg\\ffmpeg.exe" goto USE_LOCAL_FFMPEG

where ffmpeg >nul 2>nul
if %errorlevel% equ 0 goto USE_SYSTEM_FFMPEG

echo [ERROR] ffmpeg.exe was not found!
echo Please place ffmpeg.exe in the 'ffmpeg' folder or add it to system PATH.
echo See 'ffmpeg\\README.txt' for installation instructions.
echo.
pause
exit /b 1

:USE_LOCAL_FFMPEG
set FFMPEG_BIN="ffmpeg\\ffmpeg.exe"
echo [INFO] Using local FFMPEG binary from 'ffmpeg' directory.
goto PATH_CHECK_DONE

:USE_SYSTEM_FFMPEG
set FFMPEG_BIN=ffmpeg
echo [INFO] Using system FFMPEG binary from environment PATH.
goto PATH_CHECK_DONE

:PATH_CHECK_DONE
REM 2. Verify Output Directory
if not exist "output" mkdir "output"
if exist "output" echo [INFO] Output directory 'output' verified.

echo.
echo [INFO] Executing FFMPEG filters and encoding...
echo.

REM 3. Run FFMPEG
%FFMPEG_BIN% -y ${inputs.join(" ")} -filter_complex "${filterString.replace(/"/g, '\"')}" -map "${mappedVideo}" -map "${mappedAudio}" -c:v libx264 -pix_fmt yuv420p -r ${outFPS} -c:a aac -b:a 192k -ar 44100 "${outputFilename}"

if %errorlevel% neq 0 goto RENDER_ERROR

echo.
echo =====================================================================
echo  [SUCCESS] Rendering completed successfully!
echo  Output File: ${outputFilename}
echo =====================================================================
goto END

:RENDER_ERROR
echo.
echo =====================================================================
echo  [ERROR] Rendering failed! (Exit Code: %errorlevel%)
echo  Please verify local file paths or check the console logs above.
echo =====================================================================
goto END

:END
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

/**
 * 선택된 글꼴 키에 부합하는 Windows 로컬 FFMPEG 용 폰트 절대경로 반환
 */
function getFFmpegFontPath(textFont, textFontCustom) {
    if (textFont === 'custom' && textFontCustom) {
        // 사용자가 슬래시 방향을 어떻게 입력하든 FFmpeg 규격에 맞게 변환
        // 예: C:\Windows\Fonts\NanumGothic.ttf -> C\:/Windows/Fonts/NanumGothic.ttf
        let path = textFontCustom.replace(/\\/g, '/');
        if (path.substring(1, 3) === ':/') {
            path = path.charAt(0) + '\\:' + path.substring(2);
        }
        return path;
    }
    
    switch (textFont) {
        case 'gulim':
            return 'C\\:/Windows/Fonts/gulim.ttc';
        case 'batang':
            return 'C\\:/Windows/Fonts/batang.ttc';
        case 'arial':
            return 'C\\:/Windows/Fonts/arial.ttf';
        case 'malgun':
        default:
            return 'C\\:/Windows/Fonts/malgun.ttf'; // 한글 맑은 고딕 기본값
    }
}
