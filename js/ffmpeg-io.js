/**
 * sVidEditor - FFmpeg 명령어 출력 및 프로젝트 파일 입출력
 *
 * 현재 타임라인 상태로부터 FFmpeg 쉘 명령어를 생성(ffmpeg-generator.js 의존)하고
 * 클립보드에 복사하거나 Windows 배치 스크립트로 내보냅니다.
 * 또한 프로젝트(JSON) 저장/불러오기, 미디어 재연결 안내 모달, 출력 설정 변경을 담당합니다.
 */

// 프로젝트 출력 설정(해상도, FPS) 변경 핸들러
function handleProjectSettingsChange() {
    if (!DOM.projectResolution || !DOM.projectFps) return;
    const resValue = DOM.projectResolution.value; // 예: "1280x720"
    const parts = resValue.split('x');
    STATE.outputWidth = parseInt(parts[0]) || 1280;
    STATE.outputHeight = parseInt(parts[1]) || 720;
    STATE.outputFps = parseInt(DOM.projectFps.value) || 60;
    if (DOM.projectEncoder) STATE.encoder = DOM.projectEncoder.value;

    // 타임라인 눈금자 FPS 정보 업데이트
    if (DOM.timelineFpsInfo) {
        DOM.timelineFpsInfo.innerHTML = `<i class="fa-solid fa-film"></i> ${resValue} ${STATE.outputFps}fps`;
    }

    // FFmpeg 명령어 리프레시
    updateFFmpegCommand();
}

// --- FFmpeg 쉘 커맨드 출력 및 클립보드 복사 ---
function updateFFmpegCommand() {
    const result = generateFFmpegCommand({
        clips: STATE.clips,
        assets: STATE.assets,
        outputWidth: STATE.outputWidth,
        outputHeight: STATE.outputHeight,
        outputFps: STATE.outputFps
    });

    if (result.error) {
        DOM.ffmpegCommandPreview.value = `[경고] ${result.error}`;
    } else {
        DOM.ffmpegCommandPreview.value = result.command;
    }
}

function copyFFmpegCommand() {
    const cmd = DOM.ffmpegCommandPreview.value;
    if (cmd && !cmd.startsWith("[경고]")) {
        navigator.clipboard.writeText(cmd)
            .then(() => alert("FFmpeg 명령어가 클립보드에 복사되었습니다!"))
            .catch(e => console.error("클립보드 복사 실패:", e));
    } else {
        alert("복사할 수 있는 정당한 FFmpeg 명령어가 없습니다.");
    }
}

// --- 프로젝트 제어 파일 입출력 (Save/Load) ---
function confirmNewProject() {
    if (confirm("프로젝트를 초기화하고 모든 타임라인 설정을 삭제하시겠습니까?")) {
        STATE.assets = [];
        STATE.clips = [];
        STATE.selectedClipId = null;
        STATE.playheadTime = 0;

        DOM.hiddenPlayersContainer.innerHTML = '';
        Object.keys(activePlayers).forEach(k => delete activePlayers[k]);

        STATE.outputWidth = 1920;
        STATE.outputHeight = 1080;
        STATE.outputFps = 30;
        if (DOM.projectResolution) DOM.projectResolution.value = "1920x1080";
        if (DOM.projectFps) DOM.projectFps.value = "30";
        if (DOM.timelineFpsInfo) DOM.timelineFpsInfo.innerHTML = `<i class="fa-solid fa-film"></i> 1920x1080 30fps`;

        selectClip(null);
        updateAssetListUI();
        updateTimelineClipsUI();
        recalculateTotalDuration();
        renderPreview();
        updateFFmpegCommand();
    }
}

// 프로젝트 JSON 내려받기
function saveProjectFile() {
    // 로컬 브라우저 File 객체는 저장할 수 없으므로 메타데이터 위주로 직렬화
    const cleanAssets = STATE.assets.map(a => ({
        id: a.id,
        name: a.name,
        type: a.type,
        duration: a.duration,
        localPath: a.localPath
    }));

    const projectData = {
        version: "sVidEditor-v1.0",
        assets: cleanAssets,
        clips: STATE.clips,
        totalDuration: STATE.totalDuration,
        outputWidth: STATE.outputWidth,
        outputHeight: STATE.outputHeight,
        outputFps: STATE.outputFps
    };

    const blob = new Blob([JSON.stringify(projectData, null, 4)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `sVidEditor_project_${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// 프로젝트 JSON 로드
function loadProjectFile(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const data = JSON.parse(event.target.result);
            if (data.version !== "sVidEditor-v1.0") {
                alert("지원하지 않는 프로젝트 규격 파일입니다.");
                return;
            }

            // 프로젝트 복구 시작
            STATE.clips = data.clips.map(c => ({
                ...c,
                speed: c.speed || 1.0
            }));
            STATE.totalDuration = data.totalDuration;
            STATE.outputWidth = data.outputWidth || 1280;
            STATE.outputHeight = data.outputHeight || 720;
            STATE.outputFps = data.outputFps || 60;

            // UI 설정 제어 드롭다운 동기화
            if (DOM.projectResolution) {
                DOM.projectResolution.value = `${STATE.outputWidth}x${STATE.outputHeight}`;
            }
            if (DOM.projectFps) {
                DOM.projectFps.value = STATE.outputFps;
            }
            if (DOM.timelineFpsInfo) {
                DOM.timelineFpsInfo.innerHTML = `<i class="fa-solid fa-film"></i> ${STATE.outputWidth}x${STATE.outputHeight} ${STATE.outputFps}fps`;
            }

            // 에셋 목록은 파일 내용이 로컬 매핑 경로로만 구성되어 있으므로,
            // 프리뷰를 작동시키기 위해 안내 메세지를 띄웁니다.
            STATE.assets = data.assets.map(a => ({
                ...a,
                url: null, // 브라우저 가상 파일은 비어 있음
                file: null
            }));

            // 로드 후 UI 갱신
            STATE.selectedClipId = null;
            selectClip(null);
            updateAssetListUI();
            updateTimelineClipsUI();
            recalculateTotalDuration();
            renderPreview();
            updateFFmpegCommand();

            // 자동으로 미디어 파일 선택창 열기 시도 (비동기 스레드이므로 브라우저 보안 정책에 따라 차단될 수 있음)
            console.log("[sVidEditor] 프로젝트 로드 완료. 미디어 파일 재선택 창을 자동으로 엽니다.");
            try {
                DOM.inputMedia.click();
            } catch (err) {
                console.warn("[sVidEditor] 자동 파일 선택창 열기 실패 (사용자 동작 필요):", err);
            }

            // 브라우저 정책으로 인해 자동 실행이 차단될 것을 대비하여, 클릭 시 100% 열리는 안내 모달 노출
            showMediaReconnectModal();

        } catch (err) {
            console.error("JSON 파싱 에러:", err);
            alert("프로젝트 파일을 읽는 도중 오류가 발생했습니다.");
        }
    };
    reader.readAsText(file);
}

// 프로젝트 로드 후 미디어 재연결 안내 모달 띄우기
function showMediaReconnectModal() {
    // 기존 모달이 존재하면 제거
    const existing = document.getElementById('media-reconnect-modal');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'media-reconnect-modal';
    overlay.className = 'modal-overlay';

    overlay.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <i class="fa-solid fa-wand-magic-sparkles"></i>
                <h3>프로젝트 불러오기 완료</h3>
            </div>
            <div class="modal-body">
                <p>프로젝트 설정을 성공적으로 불러왔습니다!</p>
                <p>브라우저의 보안 제한으로 인해 비디오 및 오디오 미리보기를 활성화하려면, <strong>프로젝트에 사용된 미디어 파일들을 다시 한 번 선택</strong>해 주셔야 합니다.</p>
                <div class="warning-note">
                    <i class="fa-solid fa-circle-info"></i> 로컬 FFmpeg 렌더링 경로와 편집했던 타임라인 클립 정보는 그대로 유지됩니다.
                </div>
            </div>
            <div class="modal-footer">
                <button id="modal-btn-cancel" class="btn btn-secondary">나중에</button>
                <button id="modal-btn-select" class="btn btn-primary"><i class="fa-solid fa-file-video"></i> 미디어 파일 선택</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    // CSS 트랜지션을 작동시키기 위해 브라우저 렌더 큐 비우기
    requestAnimationFrame(() => {
        overlay.classList.add('show');
    });

    const selectBtn = overlay.querySelector('#modal-btn-select');
    const cancelBtn = overlay.querySelector('#modal-btn-cancel');

    selectBtn.addEventListener('click', () => {
        overlay.classList.remove('show');
        setTimeout(() => overlay.remove(), 300);
        // 사용자 클릭 핸들러 내부이므로 브라우저 보안 제약을 우회하여 100% 파일 창 열림
        DOM.inputMedia.click();
    });

    cancelBtn.addEventListener('click', () => {
        overlay.classList.remove('show');
        setTimeout(() => overlay.remove(), 300);
    });

    // 배경 클릭 시 닫기
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            overlay.classList.remove('show');
            setTimeout(() => overlay.remove(), 300);
        }
    });
}

// FFmpeg Windows 배치파일 내보내기 (.bat)
function exportFFmpegBatchScript() {
    const result = generateFFmpegCommand({
        clips: STATE.clips,
        assets: STATE.assets,
        outputWidth: STATE.outputWidth,
        outputHeight: STATE.outputHeight,
        outputFps: STATE.outputFps,
        encoder: STATE.encoder || 'h264_nvenc'
    });

    if (result.error) {
        alert(`[내보내기 실패]\n\n${result.error}`);
        return;
    }

    // Windows CMD는 CRLF(\r\n) 줄바꿈이 필요. JS 템플릿 리터럴은 LF(\n)만 생성하므로 변환
    // UTF-8 BOM(\uFEFF)을 앞에 붙여 CMD에서 한글 파일명 경로를 올바르게 처리
    const crlfContent = result.batContent.replace(/\r?\n/g, '\r\n');
    const blob = new Blob(['\uFEFF', crlfContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = "render.bat";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
