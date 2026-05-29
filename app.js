/**
 * sVidEditor - Core Application Logic
 * 
 * 이 파일은 웹 동영상 편집기의 상태 관리, 타임라인 인터랙션,
 * 실시간 브라우저 프리뷰(Canvas 렌더링), 프로젝트 파일(JSON) 입출력 등을 제어합니다.
 */

// import { generateFFmpegCommand } from './ffmpeg-generator.js'; // 전역 스크립트로 로드되므로 주석 처리

// --- 글로벌 애플리케이션 상태 (State) ---
const STATE = {
    assets: [],           // 가져온 소스 미디어 목록 ({ id, name, type, duration, url, file, localPath })
    clips: [],            // 타임라인에 배치된 개별 클립 목록
    selectedClipId: null, // 현재 선택된 클립 ID
    playheadTime: 0,      // 현재 재생헤드 시간 (단위: 초)
    timelineZoom: 15,     // 줌 비율 (초당 픽셀 수, 기본 15px/s)
    isPlaying: false,     // 재생 여부
    totalDuration: 30,    // 타임라인 전체 길이 (가변적)
    previewVolume: 0.8,   // 프리뷰 음량
    isMuted: false,       // 프리뷰 음소거 상태
    lastAnimFrameId: null,// requestAnimationFrame ID
    lastTimeUpdate: 0,    // 재생용 이전 타임스탬프
    outputWidth: 1920,    // 최종 비디오 출력 가로 크기
    outputHeight: 1080,   // 최종 비디오 출력 세로 크기
    outputFps: 30,         // 최종 비디오 출력 프레임 레이트
    encoder: 'h264_nvenc', // 렌더링 인코더 (h264_nvenc: GPU, libx264: CPU)
    playerLastSeekTimes: {} // 플레이어별 마지막 Seek 타임스탬프 (ms, 싱크 지터 방지)
};

// 비디오 효과 렌더링용 임시 버퍼 캔버스 (Chromium 비디오 필터 가속 버그 우회용)
const filterBufferCanvas = document.createElement('canvas');
const filterBufferCtx = filterBufferCanvas.getContext('2d');

// --- DOM 요소 캐싱 ---
const DOM = {
    btnNewProject: document.getElementById('btn-new-project'),
    btnLoadProject: document.getElementById('btn-load-project'),
    inputLoadProject: document.getElementById('input-load-project'),
    btnSaveProject: document.getElementById('btn-save-project'),
    btnExportScript: document.getElementById('btn-export-script'),
    inputMedia: document.getElementById('input-media'),
    mediaDropzone: document.getElementById('media-dropzone'),
    assetList: document.getElementById('asset-list'),
    previewCanvas: document.getElementById('preview-canvas'),
    previewOverlay: document.getElementById('preview-overlay'),
    timeDisplay: document.getElementById('time-display'),
    btnPlay: document.getElementById('btn-player-play'),
    btnStop: document.getElementById('btn-player-stop'),
    btnPrevFrame: document.getElementById('btn-player-prev-frame'),
    btnNextFrame: document.getElementById('btn-player-next-frame'),
    btnMute: document.getElementById('btn-preview-mute'),
    previewVolumeSlider: document.getElementById('preview-volume'),
    ffmpegCommandPreview: document.getElementById('ffmpeg-command-preview'),
    btnCopyCommand: document.getElementById('btn-copy-command'),
    timelineZoomSlider: document.getElementById('timeline-zoom'),
    zoomValueText: document.getElementById('zoom-value'),
    timelineScrollContainer: document.getElementById('timeline-scroll-container'),
    timelineRuler: document.getElementById('timeline-ruler'),
    playhead: document.getElementById('playhead'),
    trackVideo1: document.getElementById('lane-video1'),
    trackVideo2: document.getElementById('lane-video2'),
    trackAudio: document.getElementById('lane-audio'),
    trackOverlay: document.getElementById('lane-overlay'),
    btnAddTextClip: document.getElementById('btn-add-text-clip'),
    btnTimelineSplit: document.getElementById('btn-timeline-split'),
    btnTimelineClear: document.getElementById('btn-timeline-clear'),
    
    // 속성 제어 패널 관련
    propertiesEmptyMsg: document.getElementById('properties-empty-msg'),
    propertiesForm: document.getElementById('properties-form'),
    propClipTitle: document.getElementById('prop-clip-title'),
    propFileName: document.getElementById('prop-file-name'),
    propLocalPath: document.getElementById('prop-local-path'),
    propTimelineStart: document.getElementById('prop-timeline-start'),
    propDuration: document.getElementById('prop-duration'),
    propSourceStart: document.getElementById('prop-source-start'),
    propSourceEnd: document.getElementById('prop-source-end'),
    
    // 속성 세부 섹션
    videoPropertiesSection: document.getElementById('video-properties-section'),
    pipPropertiesSection: document.getElementById('pip-properties-section'),
    audioPropertiesSection: document.getElementById('audio-properties-section'),
    overlayPropertiesSection: document.getElementById('overlay-properties-section'),
    textOverlaySection: document.getElementById('text-overlay-section'),
    imageOverlaySection: document.getElementById('image-overlay-section'),
    
    // 속성 값 입력란
    propRotation: document.getElementById('prop-rotation'),
    propVolume: document.getElementById('prop-volume'),
    propVolumeLabel: document.getElementById('prop-volume-label'),
    propPipWidth: document.getElementById('prop-pip-width'),
    propPipHeight: document.getElementById('prop-pip-height'),
    propPipX: document.getElementById('prop-pip-x'),
    propPipY: document.getElementById('prop-pip-y'),
    propAudioVolume: document.getElementById('prop-audio-volume'),
    propAudioVolumeLabel: document.getElementById('prop-audio-volume-label'),
    propTextContent: document.getElementById('prop-text-content'),
    propTextSize: document.getElementById('prop-text-size'),
    propTextColor: document.getElementById('prop-text-color'),
    propImgWidth: document.getElementById('prop-img-width'),
    propImgHeight: document.getElementById('prop-img-height'),
    propTextX: document.getElementById('prop-text-x'),
    propTextY: document.getElementById('prop-text-y'),
    btnApplyProperties: document.getElementById('btn-apply-properties'),
    propVideoEffectsList: document.getElementById('prop-video-effects-list'),
    btnDeleteClip: document.getElementById('btn-delete-clip'),
    
    hiddenPlayersContainer: document.getElementById('hidden-players-container'),
    
    // 프로젝트 출력 설정 추가
    projectResolution: document.getElementById('project-resolution'),
    projectFps: document.getElementById('project-fps'),
    projectEncoder: document.getElementById('project-encoder'),
    timelineFpsInfo: document.getElementById('timeline-fps-info')
};

// Canvas 컨텍스트 및 오버레이 버퍼 캐시
const ctx = DOM.previewCanvas.getContext('2d');
const activePlayers = {}; // assetId -> hidden DOM element (video/audio)

// --- 초기화 설정 ---
window.addEventListener('DOMContentLoaded', () => {
    initApp();
});

function initApp() {
    // 1. 이벤트 바인딩
    setupEventListeners();
    
    // 2. 초기 드로잉
    updateTimelineZoom();
    updatePlayheadPosition();
    drawRuler();
    renderPreview();
    updateFFmpegCommand();
}

function setupEventListeners() {
    // 미디어 가져오기 이벤트
    DOM.mediaDropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        DOM.mediaDropzone.classList.add('dragover');
    });
    DOM.mediaDropzone.addEventListener('dragleave', () => {
        DOM.mediaDropzone.classList.remove('dragover');
    });
    DOM.mediaDropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        DOM.mediaDropzone.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
            handleMediaImport(e.dataTransfer.files);
        }
    });
    DOM.inputMedia.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleMediaImport(e.target.files);
            e.target.value = ''; // Reset value to allow re-selecting same files
        }
    });

    // 프로젝트 관리 이벤트
    DOM.btnNewProject.addEventListener('click', confirmNewProject);
    DOM.btnLoadProject.addEventListener('click', () => DOM.inputLoadProject.click());
    DOM.inputLoadProject.addEventListener('change', loadProjectFile);
    DOM.btnSaveProject.addEventListener('click', saveProjectFile);
    DOM.btnExportScript.addEventListener('click', exportFFmpegBatchScript);

    // 플레이어 제어 이벤트
    DOM.btnPlay.addEventListener('click', togglePlayback);
    DOM.btnStop.addEventListener('click', stopPlayback);
    DOM.btnPrevFrame.addEventListener('click', () => stepFrame(-0.05));
    DOM.btnNextFrame.addEventListener('click', () => stepFrame(0.05));
    
    DOM.btnMute.addEventListener('click', toggleMute);
    DOM.previewVolumeSlider.addEventListener('input', (e) => {
        STATE.previewVolume = parseFloat(e.target.value);
        STATE.isMuted = STATE.previewVolume === 0;
        updateMuteUI();
        updateActivePlayersVolumes();
    });

    // 툴바 이벤트
    DOM.timelineZoomSlider.addEventListener('input', (e) => {
        STATE.timelineZoom = parseInt(e.target.value);
        updateTimelineZoom();
    });
    
    DOM.btnAddTextClip.addEventListener('click', addTextOverlayClip);
    DOM.btnTimelineSplit.addEventListener('click', splitSelectedClip);
    DOM.btnTimelineClear.addEventListener('click', clearTimeline);
    
    // 단축키 매핑 (S: 분할, Space: 재생/일시정지, Delete: 선택된 클립 삭제)
    window.addEventListener('keydown', (e) => {
        if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') {
            return; // 텍스트 입력창 조작 중일 때는 단축키 막기
        }
        if (e.code === 'Space') {
            e.preventDefault();
            togglePlayback();
        } else if (e.code === 'KeyS') {
            e.preventDefault();
            splitSelectedClip();
        } else if (e.code === 'Delete') {
            e.preventDefault();
            if (STATE.selectedClipId) {
                deleteClip(STATE.selectedClipId);
            }
        }
    });

    // 타임라인 눈금자(Ruler) 드래그 및 스크러빙
    let isScrubbing = false;
    DOM.timelineRuler.addEventListener('mousedown', (e) => {
        isScrubbing = true;
        scrub(e);
    });
    window.addEventListener('mousemove', (e) => {
        if (isScrubbing) scrub(e);
    });
    window.addEventListener('mouseup', () => {
        isScrubbing = false;
    });

    // 재생헤드 다이아몬드 핸들 드래그 연동
    let isDraggingPlayhead = false;
    const playheadHandle = document.querySelector('.playhead-handle');
    if (playheadHandle) {
        playheadHandle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            isDraggingPlayhead = true;
        });
        window.addEventListener('mousemove', (e) => {
            if (isDraggingPlayhead) {
                scrub(e);
            }
        });
        window.addEventListener('mouseup', () => {
            isDraggingPlayhead = false;
        });
    }

    // 속성 패널 컨트롤러 실시간 값 감지 및 자동 저장 반영
    const propInputs = [
        DOM.propLocalPath, DOM.propTimelineStart, DOM.propDuration,
        DOM.propSourceStart, DOM.propSourceEnd, DOM.propRotation,
        DOM.propVolume, DOM.propPipWidth, DOM.propPipHeight,
        DOM.propPipX, DOM.propPipY, DOM.propAudioVolume,
        DOM.propTextContent, DOM.propTextSize, DOM.propTextColor,
        DOM.propImgWidth, DOM.propImgHeight, DOM.propTextX, DOM.propTextY
    ];
    propInputs.forEach(input => {
        if (input) {
            input.addEventListener('input', updateSelectedClipFromInputs);
            input.addEventListener('change', updateSelectedClipFromInputs);
        }
    });

    // 시간 값 입력 포커스 해제 시 메인 트랙 클립 자석 정렬 구동
    const timeInputs = [DOM.propTimelineStart, DOM.propDuration, DOM.propSourceStart, DOM.propSourceEnd];
    timeInputs.forEach(input => {
        if (input) {
            input.addEventListener('blur', () => {
                if (STATE.selectedClipId) {
                    const clip = STATE.clips.find(c => c.id === STATE.selectedClipId);
                    if (clip && clip.track === 'video1') {
                        // alignVideo1Clips(null); // 자석식 정렬 일시적 비활성화 (자유 이동 보장)
                        updateTimelineClipsUI();
                        recalculateTotalDuration();
                        renderPreview();
                        updateFFmpegCommand();
                    }
                }
            });
        }
    });

    DOM.btnApplyProperties.addEventListener('click', applyPropertiesChanges);
    DOM.btnDeleteClip.addEventListener('click', () => {
        if (STATE.selectedClipId) {
            deleteClip(STATE.selectedClipId);
        }
    });

    // 텍스트 복사 버튼
    DOM.btnCopyCommand.addEventListener('click', copyFFmpegCommand);

    // 타임라인 레인 드래그 오버
    const lanes = [DOM.trackVideo1, DOM.trackVideo2, DOM.trackAudio, DOM.trackOverlay];
    lanes.forEach(lane => {
        lane.addEventListener('dragover', (e) => {
            e.preventDefault();
            lane.classList.add('dragover-lane');
        });
        lane.addEventListener('dragleave', () => {
            lane.classList.remove('dragover-lane');
        });
        lane.addEventListener('drop', (e) => {
            lane.classList.remove('dragover-lane');
            e.preventDefault();
            
            // 미디어 라이브러리에서 드래그해 놓은 자산 처리
            const assetId = e.dataTransfer.getData('text/plain');
            const targetTrack = lane.parentElement.dataset.trackType;
            if (assetId) {
                const rect = lane.getBoundingClientRect();
                const dropX = e.clientX - rect.left + lane.scrollLeft;
                const timelineStart = Math.max(0, dropX / STATE.timelineZoom);
                addAssetToTimeline(assetId, targetTrack, timelineStart);
            }
        });
    });

    // 프로젝트 출력 설정 변경 감지
    if (DOM.projectResolution) {
        DOM.projectResolution.addEventListener('change', handleProjectSettingsChange);
    }
    if (DOM.projectFps) {
        DOM.projectFps.addEventListener('change', handleProjectSettingsChange);
    }
    if (DOM.projectEncoder) {
        DOM.projectEncoder.addEventListener('change', handleProjectSettingsChange);
    }

    // 타임라인 가로 스크롤 시 눈금자 실시간 리렌더링
    if (DOM.timelineScrollContainer) {
        DOM.timelineScrollContainer.addEventListener('scroll', drawRuler);
    }
}

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

// --- 미디어 파일 임포트 로직 ---
function handleMediaImport(files) {
    // 미디어 파일 재연결 안내 모달이 열려 있으면 닫기
    const reconnectModal = document.getElementById('media-reconnect-modal');
    if (reconnectModal) {
        reconnectModal.classList.remove('show');
        setTimeout(() => reconnectModal.remove(), 300);
    }

    DOM.previewOverlay.classList.remove('hide');
    let loadedCount = 0;

    // 안전장치: 6초 후에도 로딩 오버레이가 안 닫히면 강제로 닫음
    const safetyTimeout = setTimeout(() => {
        if (!DOM.previewOverlay.classList.contains('hide')) {
            console.warn("[sVidEditor] 미디어 로드가 지연되어 로딩 오버레이를 강제로 닫습니다.");
            DOM.previewOverlay.classList.add('hide');
            updateAssetListUI();
            updateTimelineClipsUI();
            renderPreview();
            updateFFmpegCommand();
        }
    }, 6000);
    
    Array.from(files).forEach(file => {
        // 미디어 파일 확장자 및 기본 타입 식별 (브라우저가 인식하지 못하는 포맷 대비 확장자 기반 감지 포함)
        let type = 'video';
        const fileNameLower = file.name.toLowerCase();
        
        if (file.type.startsWith('audio/') || 
            fileNameLower.endsWith('.mp3') || 
            fileNameLower.endsWith('.wav') || 
            fileNameLower.endsWith('.m4a') || 
            fileNameLower.endsWith('.aac') || 
            fileNameLower.endsWith('.flac') || 
            fileNameLower.endsWith('.wma') || 
            fileNameLower.endsWith('.ogg')) {
            type = 'audio';
        } else if (file.type.startsWith('image/') || 
                   fileNameLower.endsWith('.png') || 
                   fileNameLower.endsWith('.jpg') || 
                   fileNameLower.endsWith('.jpeg')) {
            type = 'image';
        }

        const url = URL.createObjectURL(file);
        
        // 기존에 로드된 프로젝트 에셋(url이 비어있는 상태) 중 이름이 일치하는 것이 있는지 검사 (대소문자 구분 없음)
        let existingAsset = STATE.assets.find(a => a.name.toLowerCase() === file.name.toLowerCase() && !a.url);
        if (!existingAsset) {
            // 프로젝트 로드 상태가 아니더라도 이름이 같은 에셋이 있다면 해당 에셋을 덮어씀
            existingAsset = STATE.assets.find(a => a.name.toLowerCase() === file.name.toLowerCase());
        }

        console.log("[sVidEditor Debug] Importing file:", file.name, "size:", file.size);
        console.log("[sVidEditor Debug] Current assets in state:", STATE.assets.map(a => ({ id: a.id, name: a.name, hasUrl: !!a.url })));

        // 기존 에셋이 없다면 새 에셋 객체 정의
        let asset = existingAsset;
        if (!existingAsset) {
            console.log("[sVidEditor Debug] Match not found. Creating new asset.");
            const id = 'asset_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
            const localPath = `D:\\Study\\WebPage\\sVidEditor\\source\\${file.name}`;
            asset = {
                id,
                name: file.name,
                type,
                url,
                file,
                localPath,
                duration: 0
            };
        } else {
            console.log("[sVidEditor Debug] Matched existing asset:", existingAsset.id, existingAsset.name);
            // 기존 에셋 정보 업데이트
            existingAsset.url = url;
            existingAsset.file = file;
        }

        // 브라우저 메타데이터 읽기 및 상태 반영
        // 레이스 컨디션 방지를 위해 온로드/에러 핸들러를 먼저 붙인 후 src를 대입합니다.
        if (type === 'video') {
            const tempVideo = document.createElement('video');
            tempVideo.onloadedmetadata = () => {
                asset.duration = tempVideo.duration;
                asset.isPreviewDisabled = false;
                if (!existingAsset) {
                    STATE.assets.push(asset);
                }
                createHiddenPlayer(asset);
                checkLoadComplete();
            };
            tempVideo.onerror = () => {
                console.warn("브라우저에서 직접 프리뷰가 불가능한 비디오 코덱/포맷입니다. (FFmpeg 로컬 렌더링은 가능):", file.name);
                asset.duration = 10.0; // 기본 지속시간 임시 할당
                asset.isPreviewDisabled = true;
                if (!existingAsset) {
                    STATE.assets.push(asset);
                }
                createHiddenPlayer(asset);
                checkLoadComplete();
            };
            tempVideo.src = url;
        } else if (type === 'audio') {
            const tempAudio = document.createElement('audio');
            tempAudio.onloadedmetadata = () => {
                asset.duration = tempAudio.duration;
                asset.isPreviewDisabled = false;
                if (!existingAsset) {
                    STATE.assets.push(asset);
                }
                createHiddenPlayer(asset);
                checkLoadComplete();
            };
            tempAudio.onerror = () => {
                console.warn("브라우저에서 직접 프리뷰가 불가능한 오디오 코덱/포맷입니다. (FFmpeg 로컬 렌더링은 가능):", file.name);
                asset.duration = 10.0; // 기본 지속시간 임시 할당
                asset.isPreviewDisabled = true;
                if (!existingAsset) {
                    STATE.assets.push(asset);
                }
                createHiddenPlayer(asset);
                checkLoadComplete();
            };
            tempAudio.src = url;
        } else if (type === 'image') {
            asset.duration = 5.0; // 이미지는 기본 지속시간 5초 설정
            if (!existingAsset) {
                STATE.assets.push(asset);
            }
            checkLoadComplete();
        }

        function checkLoadComplete() {
            loadedCount++;
            if (loadedCount === files.length) {
                clearTimeout(safetyTimeout);
                DOM.previewOverlay.classList.add('hide');
                updateAssetListUI();
                updateTimelineClipsUI();
                renderPreview();
                updateFFmpegCommand();
            }
        }
    });
}

function createHiddenPlayer(asset) {
    if (asset.type === 'image') return;
    
    // 이미 해당 에셋 ID를 가진 플레이어가 활성화되어 있다면 src 주소만 갱신
    if (activePlayers[asset.id]) {
        console.log("[sVidEditor Debug] Reusing player for asset:", asset.id, asset.name, "new url:", asset.url);
        activePlayers[asset.id].src = asset.url;
        activePlayers[asset.id].dataset.unlocked = 'false'; // 새로운 주소이므로 잠금 해제 플래그 리셋
        return;
    }
    
    console.log("[sVidEditor Debug] Creating new video/audio player element for asset:", asset.id, asset.name, "url:", asset.url);
    
    let el;
    if (asset.type === 'video') {
        el = document.createElement('video');
        el.setAttribute('playsinline', '');
        el.muted = true; // 비디오 플레이어는 캔버스 렌더 전용이므로 항상 음소거. 오디오 노드 별도 제어 가능
    } else {
        el = document.createElement('audio');
    }
    
    el.preload = 'auto';
    el.dataset.assetId = asset.id;
    
    // 비디오 로드 완료 및 탐색(seeked) 시 실시간 프리뷰 자동 갱신 리스너 등록
    el.addEventListener('seeked', () => { if (!STATE.isPlaying) renderPreview(); });
    el.addEventListener('loadeddata', () => { renderPreview(); });
    el.addEventListener('canplay', () => { renderPreview(); });
    
    // 레이스 컨디션 방지: 리스너 부착 완료 후 src 지정
    el.src = asset.url;
    
    DOM.hiddenPlayersContainer.appendChild(el);
    activePlayers[asset.id] = el;
}

// 미디어 목록 UI 갱신
function updateAssetListUI() {
    DOM.assetList.innerHTML = '';
    
    if (STATE.assets.length === 0) {
        DOM.assetList.innerHTML = '<li class="empty-list-msg">미디어 파일이 없습니다.</li>';
        return;
    }

    STATE.assets.forEach(asset => {
        const li = document.createElement('li');
        li.className = 'asset-item';
        li.draggable = true;
        li.dataset.assetId = asset.id;
        
        let typeIcon = '<i class="fa-solid fa-file-video asset-icon video"></i>';
        if (asset.type === 'audio') {
            typeIcon = '<i class="fa-solid fa-file-audio asset-icon audio"></i>';
        } else if (asset.type === 'image') {
            typeIcon = '<i class="fa-solid fa-file-image asset-icon image"></i>';
        }

        li.innerHTML = `
            ${typeIcon}
            <span class="asset-name" title="${asset.name}">${asset.name}</span>
            <span class="asset-duration">${asset.duration.toFixed(1)}s</span>
        `;

        // 드래그 앤 드롭 시작
        li.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', asset.id);
            e.dataTransfer.effectAllowed = 'copy';
        });

        // 더블 클릭 시 트랙 배치
        li.addEventListener('dblclick', () => {
            let targetTrack = 'video1';
            if (asset.type === 'audio') targetTrack = 'audio';
            else if (asset.type === 'image') targetTrack = 'overlay';
            
            // 현재 트랙 끝 지점을 시작 시간으로 설정
            const sameTrackClips = STATE.clips.filter(c => c.track === targetTrack);
            let timelineStart = 0;
            sameTrackClips.forEach(c => {
                const clipEnd = c.timelineStart + c.duration;
                if (clipEnd > timelineStart) timelineStart = clipEnd;
            });

            addAssetToTimeline(asset.id, targetTrack, timelineStart);
        });

        DOM.assetList.appendChild(li);
    });
}

// --- 타임라인 편집 로직 ---
function addAssetToTimeline(assetId, track, timelineStart) {
    const asset = STATE.assets.find(a => a.id === assetId);
    if (!asset) return;

    // 비디오 트랙 2는 자석식 Concatenate가 아닌 오버레이용 PIP이므로 겹쳐도 됨
    // 트랙 1의 경우에는 클립이 겹치지 않도록 밀어내는 스마트 처리를 해주면 더욱 편리함
    const id = 'clip_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    
    // 기본 클립 구조체 생성
    const clip = {
        id,
        track,
        assetId: asset.id,
        name: asset.name,
        localPath: asset.localPath,
        timelineStart: parseFloat(timelineStart.toFixed(2)),
        duration: parseFloat(asset.duration.toFixed(2)),
        sourceStart: 0,
        sourceEnd: parseFloat(asset.duration.toFixed(2)),
        volume: 1.0,
        rotation: 0,
        effects: []
    };

    if (track === 'video2') {
        // PIP 비디오의 경우 기본 좌표 및 크기 부여
        clip.pip = {
            width: 320,
            height: 180,
            x: 20,
            y: 20
        };
    } else if (track === 'overlay') {
        if (asset.type === 'image') {
            clip.overlayType = 'image';
            clip.width = 150;
            clip.height = 150;
            clip.x = 100;
            clip.y = 100;
        }
    }

    STATE.clips.push(clip);
    selectClip(id);
    updateTimelineClipsUI();
    recalculateTotalDuration();
    renderPreview();
    updateFFmpegCommand();
}

// 자막 추가 기능
function addTextOverlayClip() {
    const id = 'clip_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    const clip = {
        id,
        track: 'overlay',
        assetId: null,
        name: '자막 텍스트',
        localPath: '',
        timelineStart: STATE.playheadTime,
        duration: 3.0, // 기본 자막 시간 3초
        sourceStart: 0,
        sourceEnd: 3.0,
        overlayType: 'text',
        text: '여기에 자막 내용을 입력하세요',
        textSize: 36,
        textColor: '#ffffff',
        x: 640, // 가로 중앙 정렬 (1280 해상도 기준)
        y: 600  // 하단 마진
    };
    
    STATE.clips.push(clip);
    selectClip(id);
    updateTimelineClipsUI();
    recalculateTotalDuration();
    renderPreview();
    updateFFmpegCommand();
}

// 타임라인 클립 선택 로직
function selectClip(clipId) {
    STATE.selectedClipId = clipId;
    
    // 타임라인 요소 클래스 추가
    document.querySelectorAll('.timeline-clip').forEach(el => {
        el.classList.remove('selected');
        if (el.dataset.clipId === clipId) {
            el.classList.add('selected');
        }
    });

    const clip = STATE.clips.find(c => c.id === clipId);
    if (!clip) {
        DOM.propertiesEmptyMsg.classList.remove('hide');
        DOM.propertiesForm.classList.add('hide');
        return;
    }

    DOM.propertiesEmptyMsg.classList.add('hide');
    DOM.propertiesForm.classList.remove('hide');

    // 기본 정보 바인딩
    DOM.propClipTitle.textContent = getClipTypeLabel(clip);
    DOM.propFileName.value = clip.name;
    DOM.propLocalPath.value = clip.localPath;
    DOM.propTimelineStart.value = clip.timelineStart;
    DOM.propDuration.value = clip.duration;
    DOM.propSourceStart.value = clip.sourceStart;
    DOM.propSourceEnd.value = clip.sourceEnd;

    // 섹션 리셋
    DOM.videoPropertiesSection.classList.add('hide');
    DOM.pipPropertiesSection.classList.add('hide');
    DOM.audioPropertiesSection.classList.add('hide');
    DOM.overlayPropertiesSection.classList.add('hide');
    DOM.textOverlaySection.classList.add('hide');
    DOM.imageOverlaySection.classList.add('hide');

    // 클립 타입별 전용 제어란 노출
    if (clip.track === 'video1' || clip.track === 'video2') {
        DOM.videoPropertiesSection.classList.remove('hide');
        DOM.propRotation.value = clip.rotation;
        DOM.propVolume.value = clip.volume;
        DOM.propVolumeLabel.textContent = Math.round(clip.volume * 100);
        
        // 적용된 비디오 효과 배지 렌더링
        DOM.propVideoEffectsList.innerHTML = '';
        if (clip.effects && clip.effects.length > 0) {
            clip.effects.forEach(eff => {
                const badge = document.createElement('span');
                badge.className = 'prop-effect-badge';
                badge.innerHTML = `
                    <span>${eff.toUpperCase()}</span>
                    <span class="remove-effect-btn" data-effect="${eff}">&times;</span>
                `;
                
                // 효과 개별 삭제 이벤트
                badge.querySelector('.remove-effect-btn').addEventListener('click', (e) => {
                    e.stopPropagation();
                    const targetEff = e.target.dataset.effect;
                    clip.effects = clip.effects.filter(x => x !== targetEff);
                    updateTimelineClipsUI();
                    renderPreview();
                    updateFFmpegCommand();
                    selectClip(clip.id);
                });
                
                DOM.propVideoEffectsList.appendChild(badge);
            });
        } else {
            DOM.propVideoEffectsList.innerHTML = '<span class="empty-list-msg" style="font-size: 0.75rem;">적용된 효과 없음</span>';
        }
        
        if (clip.track === 'video2') {
            DOM.pipPropertiesSection.classList.remove('hide');
            DOM.propPipWidth.value = clip.pip.width;
            DOM.propPipHeight.value = clip.pip.height;
            DOM.propPipX.value = clip.pip.x;
            DOM.propPipY.value = clip.pip.y;
        }
    } else if (clip.track === 'audio') {
        DOM.audioPropertiesSection.classList.remove('hide');
        DOM.propAudioVolume.value = clip.volume;
        DOM.propAudioVolumeLabel.textContent = Math.round(clip.volume * 100);
    } else if (clip.track === 'overlay') {
        DOM.overlayPropertiesSection.classList.remove('hide');
        DOM.propTextX.value = clip.x;
        DOM.propTextY.value = clip.y;
        
        if (clip.overlayType === 'text') {
            DOM.textOverlaySection.classList.remove('hide');
            DOM.propTextContent.value = clip.text;
            DOM.propTextSize.value = clip.textSize;
            DOM.propTextColor.value = clip.textColor;
        } else if (clip.overlayType === 'image') {
            DOM.imageOverlaySection.classList.remove('hide');
            DOM.propImgWidth.value = clip.width;
            DOM.propImgHeight.value = clip.height;
        }
    }
}

function getClipTypeLabel(clip) {
    if (clip.track === 'video1') return "메인 비디오 클립";
    if (clip.track === 'video2') return "PIP 오버레이 비디오";
    if (clip.track === 'audio') return "배경 음악 클립";
    if (clip.overlayType === 'text') return "텍스트 자막";
    return "PNG 이미지 오버레이";
}

// 속성 변경 사항 적용
function applyPropertiesChanges() {
    if (!STATE.selectedClipId) return;
    const clip = STATE.clips.find(c => c.id === STATE.selectedClipId);
    if (!clip) return;

    // 로컬 파일명 수집
    clip.localPath = DOM.propLocalPath.value;
    
    // 수치 형변환
    const timelineStart = parseFloat(DOM.propTimelineStart.value) || 0;
    const duration = parseFloat(DOM.propDuration.value) || 0.1;
    const sourceStart = parseFloat(DOM.propSourceStart.value) || 0;
    
    // 소스 한계치 점검
    if (clip.assetId) {
        const asset = STATE.assets.find(a => a.id === clip.assetId);
        if (asset) {
            clip.sourceEnd = Math.min(asset.duration, sourceStart + duration);
            clip.duration = parseFloat((clip.sourceEnd - sourceStart).toFixed(2));
        } else {
            clip.duration = duration;
            clip.sourceEnd = sourceStart + duration;
        }
    } else {
        clip.duration = duration;
        clip.sourceEnd = sourceStart + duration;
    }

    clip.timelineStart = timelineStart;
    clip.sourceStart = sourceStart;

    // 트랙 고유 속성 저장
    if (clip.track === 'video1' || clip.track === 'video2') {
        clip.rotation = parseInt(DOM.propRotation.value);
        clip.volume = parseFloat(DOM.propVolume.value);
        
        if (clip.track === 'video2') {
            clip.pip = {
                width: parseInt(DOM.propPipWidth.value),
                height: parseInt(DOM.propPipHeight.value),
                x: parseInt(DOM.propPipX.value),
                y: parseInt(DOM.propPipY.value)
            };
        }
    } else if (clip.track === 'audio') {
        clip.volume = parseFloat(DOM.propAudioVolume.value);
    } else if (clip.track === 'overlay') {
        clip.x = parseInt(DOM.propTextX.value);
        clip.y = parseInt(DOM.propTextY.value);
        
        if (clip.overlayType === 'text') {
            clip.text = DOM.propTextContent.value;
            clip.textSize = parseInt(DOM.propTextSize.value);
            clip.textColor = DOM.propTextColor.value;
        } else if (clip.overlayType === 'image') {
            clip.width = parseInt(DOM.propImgWidth.value);
            clip.height = parseInt(DOM.propImgHeight.value);
        }
    }

    updateTimelineClipsUI();
    recalculateTotalDuration();
    renderPreview();
    updateFFmpegCommand();
    
    // 리바인드
    selectClip(clip.id);
}

// 속성 입력 실시간 반영
function updateSelectedClipFromInputs() {
    if (!STATE.selectedClipId) return;
    const clip = STATE.clips.find(c => c.id === STATE.selectedClipId);
    if (!clip) return;

    // 로컬 파일 경로
    clip.localPath = DOM.propLocalPath.value;
    
    // 타임라인 관련 수치
    const timelineStart = parseFloat(DOM.propTimelineStart.value) || 0;
    const duration = parseFloat(DOM.propDuration.value) || 0.1;
    const sourceStart = parseFloat(DOM.propSourceStart.value) || 0;
    
    clip.timelineStart = timelineStart;
    clip.sourceStart = sourceStart;
    
    if (clip.assetId) {
        const asset = STATE.assets.find(a => a.id === clip.assetId);
        if (asset) {
            clip.sourceEnd = Math.min(asset.duration, sourceStart + duration);
            clip.duration = parseFloat((clip.sourceEnd - sourceStart).toFixed(2));
        } else {
            clip.duration = duration;
            clip.sourceEnd = sourceStart + duration;
        }
    } else {
        clip.duration = duration;
        clip.sourceEnd = sourceStart + duration;
    }

    // 트랙 고유 속성
    if (clip.track === 'video1' || clip.track === 'video2') {
        clip.rotation = parseInt(DOM.propRotation.value);
        clip.volume = parseFloat(DOM.propVolume.value);
        DOM.propVolumeLabel.textContent = Math.round(clip.volume * 100);
        
        if (clip.track === 'video2') {
            clip.pip = {
                width: parseInt(DOM.propPipWidth.value) || 320,
                height: parseInt(DOM.propPipHeight.value) || 180,
                x: parseInt(DOM.propPipX.value) || 0,
                y: parseInt(DOM.propPipY.value) || 0
            };
        }
    } else if (clip.track === 'audio') {
        clip.volume = parseFloat(DOM.propAudioVolume.value);
        DOM.propAudioVolumeLabel.textContent = Math.round(clip.volume * 100);
    } else if (clip.track === 'overlay') {
        clip.x = parseInt(DOM.propTextX.value) || 0;
        clip.y = parseInt(DOM.propTextY.value) || 0;
        
        if (clip.overlayType === 'text') {
            clip.text = DOM.propTextContent.value;
            clip.textSize = parseInt(DOM.propTextSize.value) || 36;
            clip.textColor = DOM.propTextColor.value;
            
            // 타임라인 내 클립 이름 실시간 갱신
            const clipEl = document.querySelector(`.timeline-clip[data-clip-id="${clip.id}"]`);
            if (clipEl) {
                clipEl.querySelector('.clip-name').textContent = clip.text || '자막 텍스트';
            }
        } else if (clip.overlayType === 'image') {
            clip.width = parseInt(DOM.propImgWidth.value) || 150;
            clip.height = parseInt(DOM.propImgHeight.value) || 150;
        }
    }

    // 깜빡임 방지용 실시간 위치/텍스트 전용 업데이트 호출
    updateTimelineClipsUIOnlyPosition();
    renderPreview();
    updateFFmpegCommand();
}

// 전체 요소를 삭제 후 재생성하지 않고 실시간으로 드래그/타이핑 위치 및 텍스트만 업데이트하여 포커스 유지
function updateTimelineClipsUIOnlyPosition() {
    STATE.clips.forEach(clip => {
        const el = document.querySelector(`.timeline-clip[data-clip-id="${clip.id}"]`);
        if (el) {
            const left = clip.timelineStart * STATE.timelineZoom;
            const width = clip.duration * STATE.timelineZoom;
            el.style.left = `${left}px`;
            el.style.width = `${width}px`;
            el.querySelector('.clip-duration-info').textContent = `${clip.duration.toFixed(1)}s [${clip.sourceStart.toFixed(1)}~${clip.sourceEnd.toFixed(1)}]`;
            if (clip.overlayType === 'text') {
                el.querySelector('.clip-name').textContent = clip.text || '자막 텍스트';
            }
        }
    });
}

// 클립 삭제
function deleteClip(clipId) {
    STATE.clips = STATE.clips.filter(c => c.id !== clipId);
    STATE.selectedClipId = null;
    selectClip(null);
    // alignVideo1Clips(null); // 클립 삭제 후 비디오 1 트랙 빈공간 자동 메우기 비활성화
    updateTimelineClipsUI();
    recalculateTotalDuration();
    renderPreview();
    updateFFmpegCommand();
}

// 클립 분할 (Split)
function splitSelectedClip() {
    if (!STATE.selectedClipId) return;
    const clip = STATE.clips.find(c => c.id === STATE.selectedClipId);
    if (!clip) return;

    // 분할 타임라인 시각 검증
    const splitTime = STATE.playheadTime;
    if (splitTime <= clip.timelineStart || splitTime >= clip.timelineStart + clip.duration) {
        alert("재생헤드가 선택된 클립 영역 중간에 위치해 있어야 분할이 가능합니다.");
        return;
    }

    // 전반부/후반부 구간 계산
    const firstPartDuration = splitTime - clip.timelineStart;
    const secondPartDuration = clip.timelineStart + clip.duration - splitTime;
    
    const originalSourceEnd = clip.sourceEnd;
    
    // 1. 기존 클립을 앞부분으로 변경
    clip.sourceEnd = parseFloat((clip.sourceStart + firstPartDuration).toFixed(2));
    clip.duration = parseFloat(firstPartDuration.toFixed(2));

    // 2. 뒷부분을 새로운 복제 클립으로 생성
    const newId = 'clip_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    const newClip = {
        ...JSON.parse(JSON.stringify(clip)),
        id: newId,
        timelineStart: parseFloat(splitTime.toFixed(2)),
        duration: parseFloat(secondPartDuration.toFixed(2)),
        sourceStart: parseFloat((clip.sourceEnd).toFixed(2)),
        sourceEnd: parseFloat(originalSourceEnd.toFixed(2))
    };

    STATE.clips.push(newClip);
    selectClip(newId);
    
    updateTimelineClipsUI();
    recalculateTotalDuration();
    renderPreview();
    updateFFmpegCommand();
}

// 타임라인 초기화
function clearTimeline() {
    if (confirm("정말로 타임라인의 모든 클립을 삭제하시겠습니까?")) {
        STATE.clips = [];
        STATE.selectedClipId = null;
        selectClip(null);
        updateTimelineClipsUI();
        recalculateTotalDuration();
        renderPreview();
        updateFFmpegCommand();
    }
}

// 타임라인 총 길이 재계산
function recalculateTotalDuration() {
    let maxTime = 10; // 기본 최소 길이
    STATE.clips.forEach(c => {
        const end = c.timelineStart + c.duration;
        if (end > maxTime) maxTime = end;
    });
    STATE.totalDuration = Math.max(10, maxTime + 2.0); // 끝 마진 추가
    drawRuler();
}

// --- 타임라인 UI 렌더링 및 조작 (드래그&이동) ---
function updateTimelineZoom() {
    DOM.zoomValueText.textContent = `${STATE.timelineZoom} px/s`;
    
    // 그리드 배경폭 조절
    const backgroundSize = STATE.timelineZoom;
    const lanes = [DOM.trackVideo1, DOM.trackVideo2, DOM.trackAudio, DOM.trackOverlay];
    lanes.forEach(lane => {
        lane.style.backgroundSize = `${backgroundSize}px 100%`;
    });
    
    drawRuler();
    updateTimelineClipsUI();
    updatePlayheadPosition();
}

// 타임라인 상단 캔버스 눈금자 그리기 함수
function drawRuler() {
    const canvas = DOM.timelineRuler;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    
    // 해상도 조절 (레티나/고해상도 대응 및 크기 갱신)
    canvas.width = width;
    canvas.height = height;
    
    ctx.clearRect(0, 0, width, height);
    
    // 어두운 배경색 칠하기
    ctx.fillStyle = '#16161a';
    ctx.fillRect(0, 0, width, height);
    
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#8e8e93';
    ctx.font = '9px Outfit, sans-serif';
    
    const zoom = STATE.timelineZoom;
    const container = DOM.timelineScrollContainer;
    const scrollLeft = container ? container.scrollLeft : 0;
    
    // Canvas의 물리 원점 x = 0 이 곧 타임라인 0초이므로, 
    // 가시 영역 내 시작 초 및 끝 초를 계산합니다.
    const startSec = Math.floor(scrollLeft / zoom);
    const endSec = Math.ceil((scrollLeft + width) / zoom);
    
    ctx.save();
    
    // 눈금 선들을 루프로 렌더링
    for (let sec = startSec; sec <= endSec; sec++) {
        // 실제 화면상에서의 X 좌표 계산 (Canvas 원점이 곧 0초)
        const x = (sec * zoom) - scrollLeft;
        
        if (x < 0 || x > width) continue;
        
        // 1초 단위 주 눈금
        ctx.beginPath();
        ctx.moveTo(x, height);
        ctx.lineTo(x, height - 12);
        ctx.stroke();
        
        // 2초 단위 텍스트 라벨 표시
        if (sec % 2 === 0) {
            ctx.fillText(sec + 's', x + 4, height - 4);
        }
        
        // 0.1초 단위 보조 눈금
        for (let sub = 1; sub < 10; sub++) {
            const sx = x + (sub * zoom) / 10;
            if (sx >= 0 && sx <= width) {
                ctx.beginPath();
                ctx.moveTo(sx, height);
                ctx.lineTo(sx, height - 6);
                ctx.stroke();
            }
        }
    }
    
    ctx.restore();
}

// 타임라인 눈금자 클릭/드래그 시 재생헤드 스크러빙 처리 함수
function scrub(e) {
    const canvas = DOM.timelineRuler;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    
    // Canvas 영역 내에서의 마우스 상대 X 좌표 계산
    const x = e.clientX - rect.left;
    
    const container = DOM.timelineScrollContainer;
    const scrollLeft = container ? container.scrollLeft : 0;
    
    const zoom = STATE.timelineZoom;
    // Canvas 원점 x = 0 이 곧 타임라인 0초이므로 스크롤량만 더해 계산
    const time = Math.max(0, (x + scrollLeft) / zoom);
    
    // 재생헤드 시간 업데이트 및 프리뷰 갱신
    STATE.playheadTime = parseFloat(time.toFixed(2));
    updatePlayheadPosition();
}

function updatePlayheadPosition() {
    const leftPx = 140 + STATE.playheadTime * STATE.timelineZoom;
    DOM.playhead.style.left = `${leftPx}px`;
    
    // 재생 시 스크롤 컨테이너 자동 동기화
    if (STATE.isPlaying) {
        const container = DOM.timelineScrollContainer;
        const playheadLeft = STATE.playheadTime * STATE.timelineZoom;
        const scrollLeft = container.scrollLeft;
        const visibleWidth = container.clientWidth - 140;
        
        if (playheadLeft > scrollLeft + visibleWidth - 50) {
            container.scrollLeft = playheadLeft - visibleWidth + 100;
        }
    }
    
    updateTimeDisplay();
    syncHiddenPlayersTime();
    renderPreview();
}

// Video Track 1 (메인결합) 클립 자석식 자동 정렬 및 스왑 로직
function alignVideo1Clips(draggedClipId) {
    const v1Clips = STATE.clips.filter(c => c.track === 'video1');
    if (v1Clips.length === 0) return;
    
    if (v1Clips.length === 1) {
        v1Clips[0].timelineStart = 0;
        return;
    }

    // 마우스 드래그 가상 위치 기준으로 정렬하되, 타이 브레이커로 드래그된 클립에 우선권 부여
    v1Clips.sort((a, b) => {
        if (a.id === draggedClipId) {
            return a.timelineStart - b.timelineStart - 0.01;
        }
        if (b.id === draggedClipId) {
            return a.timelineStart - b.timelineStart + 0.01;
        }
        return a.timelineStart - b.timelineStart;
    });

    // 정렬 결과에 따라 빈틈 없이 이어 붙임 (자석 타임라인)
    let currentStart = 0;
    v1Clips.forEach(c => {
        c.timelineStart = parseFloat(currentStart.toFixed(2));
        currentStart += c.duration;
    });
}

// 타임라인 클립 DOM 요소 그리기
function updateTimelineClipsUI() {
    // 이전 클립 제거
    DOM.trackVideo1.querySelectorAll('.timeline-clip').forEach(el => el.remove());
    DOM.trackVideo2.querySelectorAll('.timeline-clip').forEach(el => el.remove());
    DOM.trackAudio.querySelectorAll('.timeline-clip').forEach(el => el.remove());
    DOM.trackOverlay.querySelectorAll('.timeline-clip').forEach(el => el.remove());

    STATE.clips.forEach(clip => {
        let lane;
        let clipClass = '';
        if (clip.track === 'video1') {
            lane = DOM.trackVideo1;
            clipClass = 'clip-video1';
        } else if (clip.track === 'video2') {
            lane = DOM.trackVideo2;
            clipClass = 'clip-video2';
        } else if (clip.track === 'audio') {
            lane = DOM.trackAudio;
            clipClass = 'clip-audio-type';
        } else if (clip.track === 'overlay') {
            lane = DOM.trackOverlay;
            clipClass = 'clip-overlay-type';
        }

        if (!lane) return;

        const el = document.createElement('div');
        el.className = `timeline-clip ${clipClass}`;
        if (STATE.selectedClipId === clip.id) {
            el.classList.add('selected');
        }
        el.dataset.clipId = clip.id;
        
        // 크기 및 위치 반영
        const left = clip.timelineStart * STATE.timelineZoom;
        const width = clip.duration * STATE.timelineZoom;
        el.style.left = `${left}px`;
        el.style.width = `${width}px`;

        // 이펙트 배지 생성
        let effectsBadges = '';
        if (clip.effects && clip.effects.length > 0) {
            effectsBadges = `<div class="clip-effects-badge">` + 
                clip.effects.map(eff => `<span class="effect-badge">${eff.toUpperCase()}</span>`).join('') +
                `</div>`;
        }

        el.innerHTML = `
            <div class="trim-handle trim-handle-left"></div>
            <span class="clip-name">${clip.name || (clip.overlayType === 'text' ? clip.text : '이미지')}</span>
            <span class="clip-duration-info">${clip.duration.toFixed(1)}s [${clip.sourceStart.toFixed(1)}~${clip.sourceEnd.toFixed(1)}]</span>
            ${effectsBadges}
            <div class="trim-handle trim-handle-right"></div>
        `;

        // 클립 마우스 선택
        el.addEventListener('mousedown', (e) => {
            e.preventDefault(); // 브라우저 기본 드래그 및 텍스트 선택 차단 (커스텀 드래그 차단 방지)
            e.stopPropagation();
            selectClip(clip.id);
            
            // 드래그 또는 트리밍 탐색 시작
            const isLeftHandle = e.target.classList.contains('trim-handle-left');
            const isRightHandle = e.target.classList.contains('trim-handle-right');
            
            let startX = e.clientX;
            let startLeft = clip.timelineStart;
            let startWidth = clip.duration;
            let startSrcStart = clip.sourceStart;
            let startSrcEnd = clip.sourceEnd;
            
            const asset = clip.assetId ? STATE.assets.find(a => a.id === clip.assetId) : null;
            const assetDuration = asset ? asset.duration : 1000; // 가상 한계

            const onMouseMove = (moveEvent) => {
                try {
                    const diffX = moveEvent.clientX - startX;
                    const diffTime = diffX / STATE.timelineZoom;

                    if (isLeftHandle) {
                        // 왼쪽 에지 드래그 (시작 위치 변경 및 트리밍 확대/축소)
                        let newStart = startLeft + diffTime;
                        let newSrcStart = startSrcStart + diffTime;
                        
                        if (newSrcStart < 0) {
                            newStart = startLeft - startSrcStart;
                            newSrcStart = 0;
                        }
                        if (newStart < 0) {
                            newStart = 0;
                            newSrcStart = startSrcStart - startLeft;
                        }
                        
                        const newDur = startLeft + startWidth - newStart;
                        if (newDur > 0.1) {
                            clip.timelineStart = parseFloat(newStart.toFixed(2));
                            clip.sourceStart = parseFloat(newSrcStart.toFixed(2));
                            clip.duration = parseFloat(newDur.toFixed(2));
                        }
                    } else if (isRightHandle) {
                        // 오른쪽 에지 드래그 (종료 지점 트리밍)
                        let newDur = startWidth + diffTime;
                        let newSrcEnd = startSrcEnd + diffTime;
                        
                        if (newSrcEnd > assetDuration) {
                            newSrcEnd = assetDuration;
                            newDur = assetDuration - startSrcStart;
                        }
                        
                        if (newDur > 0.1) {
                            clip.duration = parseFloat(newDur.toFixed(2));
                            clip.sourceEnd = parseFloat(newSrcEnd.toFixed(2));
                        }
                    } else {
                        // 몸통 드래그 (시작시간 이동 및 트랙 간 세로 이동)
                        let newStart = startLeft + diffTime;
                        if (newStart < 0) newStart = 0;
                        clip.timelineStart = parseFloat(newStart.toFixed(2));
                        
                        // 세로 트랙 변경 감지 (마우스 Y 좌표 기준)
                        const y = moveEvent.clientY;
                        const lanes = [
                            { name: 'video1', element: DOM.trackVideo1 },
                            { name: 'video2', element: DOM.trackVideo2 },
                            { name: 'audio', element: DOM.trackAudio },
                            { name: 'overlay', element: DOM.trackOverlay }
                        ];
                        
                        for (const lane of lanes) {
                            const rect = lane.element.getBoundingClientRect();
                            if (y >= rect.top && y <= rect.bottom) {
                                const assetType = asset ? asset.type : (clip.overlayType ? 'overlay' : 'video');
                                
                                // 타입 교차 유효성 체크 후 다른 트랙 레인으로 엘리먼트 즉시 이동
                                if (assetType === 'video' && (lane.name === 'video1' || lane.name === 'video2')) {
                                    if (clip.track !== lane.name) {
                                        clip.track = lane.name;
                                        if (lane.name === 'video2' && !clip.pip) {
                                            clip.pip = { width: 320, height: 180, x: 20, y: 20 };
                                        }
                                        lane.element.appendChild(el);
                                    }
                                } else if (assetType === 'audio' && lane.name === 'audio') {
                                    if (clip.track !== lane.name) {
                                        clip.track = lane.name;
                                        lane.element.appendChild(el);
                                    }
                                } else if ((assetType === 'image' || assetType === 'overlay') && lane.name === 'overlay') {
                                    if (clip.track !== lane.name) {
                                        clip.track = lane.name;
                                        lane.element.appendChild(el);
                                    }
                                }
                                break;
                            }
                        }
                    }

                    // UI 가로 위치 및 텍스트 실시간 반영
                    el.style.left = `${clip.timelineStart * STATE.timelineZoom}px`;
                    el.style.width = `${clip.duration * STATE.timelineZoom}px`;
                    el.querySelector('.clip-duration-info').textContent = `${clip.duration.toFixed(1)}s [${clip.sourceStart.toFixed(1)}~${clip.sourceEnd.toFixed(1)}]`;
                    
                    updateTimeDisplay();
                    renderPreview();
                } catch (err) {
                    console.error("드래그 연산 오류:", err);
                }
            };

            const onMouseUp = () => {
                window.removeEventListener('mousemove', onMouseMove);
                window.removeEventListener('mouseup', onMouseUp);
                
                // 비디오 1 트랙(메인결합)인 경우 자석식 자동 정렬 수행 비활성화
                // if (clip.track === 'video1') {
                //     alignVideo1Clips(clip.id);
                // }
                
                // 드래그 완료 후 인풋 값 동기화 및 타임라인 리렌더링, 커맨드 재생성
                selectClip(clip.id);
                updateTimelineClipsUI();
                recalculateTotalDuration();
                renderPreview();
                updateFFmpegCommand();
            };

            window.addEventListener('mousemove', onMouseMove);
            window.addEventListener('mouseup', onMouseUp);
        });

        // 드래그 앤 드롭 효과 투하 (효과 라이브러리 드래그)
        el.addEventListener('dragover', (e) => {
            e.preventDefault();
            el.classList.add('drag-filter-over');
        });
        el.addEventListener('dragleave', () => {
            el.classList.remove('drag-filter-over');
        });
        el.addEventListener('drop', (e) => {
            e.preventDefault();
            el.classList.remove('drag-filter-over');
            
            const effectName = e.dataTransfer.getData('text/effect');
            if (effectName) {
                // 비디오에 효과 추가
                if (!clip.effects) clip.effects = [];
                if (!clip.effects.includes(effectName)) {
                    clip.effects.push(effectName);
                    updateTimelineClipsUI();
                    renderPreview();
                    updateFFmpegCommand();
                    selectClip(clip.id);
                }
            }
        });

        lane.appendChild(el);
    });
}

// 효과 라이브러리 항목 드래그 및 클릭 적용 세팅
document.querySelectorAll('.effect-item').forEach(item => {
    item.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/effect', item.dataset.effect);
        e.dataTransfer.effectAllowed = 'copy';
    });
    
    // 클릭 시 선택된 클립에 바로 효과 적용하는 편의성 인터랙션 연동
    item.addEventListener('click', () => {
        if (STATE.selectedClipId) {
            const clip = STATE.clips.find(c => c.id === STATE.selectedClipId);
            if (clip) {
                const effectName = item.dataset.effect;
                
                // 비디오 트랙 클립에만 필터 적용 가능 예외 처리
                if (clip.track !== 'video1' && clip.track !== 'video2') {
                    alert("비디오 효과는 비디오 트랙(Video 1, Video 2) 클립에만 적용 가능합니다.");
                    return;
                }
                
                if (!clip.effects) clip.effects = [];
                if (!clip.effects.includes(effectName)) {
                    clip.effects.push(effectName);
                    updateTimelineClipsUI();
                    renderPreview();
                    updateFFmpegCommand();
                    selectClip(clip.id);
                } else {
                    // 이미 있으면 효과 제거 (토글 기능 지원)
                    clip.effects = clip.effects.filter(eff => eff !== effectName);
                    updateTimelineClipsUI();
                    renderPreview();
                    updateFFmpegCommand();
                    selectClip(clip.id);
                }
            }
        } else {
            alert("효과를 적용할 클립을 타임라인에서 먼저 선택한 후 클릭해 주세요.");
        }
    });
});

// --- 프리뷰 렌더러 (Canvas Rendering Engine) ---
function renderPreview() {
    const time = STATE.playheadTime;
    
    // Canvas 초기화
    ctx.clearRect(0, 0, DOM.previewCanvas.width, DOM.previewCanvas.height);
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, DOM.previewCanvas.width, DOM.previewCanvas.height);

    // 1. 비디오 트랙 1 (메인 영상)
    const v1Clip = STATE.clips.find(c => c.track === 'video1' && time >= c.timelineStart && time < c.timelineStart + c.duration);
    if (v1Clip) {
        drawVideoClip(v1Clip, time, 0, 0, 640, 360);
    }

    // 2. 비디오 트랙 2 (PIP 오버레이 영상)
    const v2Clip = STATE.clips.find(c => c.track === 'video2' && time >= c.timelineStart && time < c.timelineStart + c.duration);
    if (v2Clip) {
        // 1280x720 렌더러 좌표계를 프리뷰용 640x360으로 매핑
        const pip = v2Clip.pip || { width: 320, height: 180, x: 20, y: 20 };
        const px = pip.x / 2;
        const py = pip.y / 2;
        const pw = pip.width / 2;
        const ph = pip.height / 2;
        
        drawVideoClip(v2Clip, time, px, py, pw, ph);
    }

    // 3. PNG 이미지 오버레이 및 자막
    const overlayClips = STATE.clips.filter(c => c.track === 'overlay' && time >= c.timelineStart && time < c.timelineStart + c.duration);
    overlayClips.forEach(clip => {
        if (clip.overlayType === 'image') {
            const asset = STATE.assets.find(a => a.id === clip.assetId);
            if (asset) {
                if (!asset.url) {
                    if (!renderPreview._lastImageWarn || Date.now() - renderPreview._lastImageWarn > 3000) {
                        console.warn("[sVidEditor Debug] Image asset has no URL (not re-imported yet?):", asset.name);
                        renderPreview._lastImageWarn = Date.now();
                    }
                    return;
                }
                // 프리뷰 해상도 반비례 리사이즈
                const imgX = clip.x / 2;
                const imgY = clip.y / 2;
                const imgW = clip.width / 2;
                const imgH = clip.height / 2;
                
                // 임시 이미지 로더 생성
                const img = new Image();
                img.src = asset.url;
                if (img.complete) {
                    ctx.drawImage(img, imgX, imgY, imgW, imgH);
                } else {
                    img.onload = () => {
                        // 스크러빙 도중 비동기 로드 시 강제 재생 방지용 재드로잉
                        if (STATE.playheadTime === time) {
                            ctx.drawImage(img, imgX, imgY, imgW, imgH);
                        }
                    };
                }
            }
        } else if (clip.overlayType === 'text') {
            ctx.fillStyle = clip.textColor || '#ffffff';
            ctx.font = `500 ${Math.round((clip.textSize || 36) / 2)}px ${STATE.fontFamily || 'Outfit'}`;
            ctx.shadowColor = 'rgba(0,0,0,0.6)';
            ctx.shadowBlur = 4;
            
            // X가 640인 경우 가로 중앙 정렬
            let textX = clip.x / 2;
            if (clip.x === 640) {
                ctx.textAlign = 'center';
                textX = 320;
            } else {
                ctx.textAlign = 'left';
            }
            
            ctx.textBaseline = 'middle';
            ctx.fillText(clip.text || '', textX, clip.y / 2);
            
            // 그림자 옵션 리셋
            ctx.shadowBlur = 0;
        }
    });
}

// 개별 비디오 그리기 + 필터 + 변환 엔진
function drawVideoClip(clip, time, x, y, w, h) {
    const player = activePlayers[clip.assetId];
    if (!player) {
        if (!drawVideoClip._lastLogTime || Date.now() - drawVideoClip._lastLogTime > 3000) {
            console.warn("[sVidEditor Debug] drawVideoClip - No player found for clip.assetId:", clip.assetId, "clip name:", clip.name);
            drawVideoClip._lastLogTime = Date.now();
        }
        return;
    }

    const asset = STATE.assets.find(a => a.id === clip.assetId);
    if (asset && asset.isPreviewDisabled) {
        ctx.save();
        const cx = x + w / 2;
        const cy = y + h / 2;
        ctx.translate(cx, cy);
        
        if (clip.rotation !== 0) {
            ctx.rotate((clip.rotation * Math.PI) / 180);
        }

        ctx.fillStyle = '#1e1e24';
        ctx.fillRect(-w / 2, -h / 2, w, h);
        
        ctx.strokeStyle = '#ff1744';
        ctx.lineWidth = 1;
        ctx.strokeRect(-w / 2 + 5, -h / 2 + 5, w - 10, h - 10);
        
        ctx.fillStyle = '#ff1744';
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('브라우저 프리뷰 불가 포맷', 0, -8);
        ctx.fillStyle = '#8e8e93';
        ctx.font = '8px sans-serif';
        ctx.fillText('(로컬 FFmpeg 렌더링은 지원됨)', 0, 8);
        
        ctx.restore();
        return;
    }

    const clipElapsed = time - clip.timelineStart;
    const sourcePlayTime = clip.sourceStart + clipElapsed;
    
    // 비디오 엘리먼트 동기 프레임 탐색 (ReadyState 검증으로 InvalidStateError 방지)
    // 재생 중(STATE.isPlaying)일 때는 updateActivePlayersStates()가 싱크 조절을 전담하므로,
    // drawVideoClip()에서는 재생 중일 때 강제로 currentTime을 셋팅하지 않고(무한 틱 방지),
    // 일시정지 상태(스크러빙 등)일 때만 정확한 프레임 반영을 위해 0.05초 오차 시 즉각 currentTime을 업데이트합니다.
    if (!STATE.isPlaying) {
        if (player.readyState >= 1) {
            try {
                if (Math.abs(player.currentTime - sourcePlayTime) > 0.05) {
                    player.currentTime = sourcePlayTime;
                }
            } catch (e) {
                console.warn("drawVideoClip currentTime 설정 실패:", e);
            }
        }
    } else {
        // 재생 중일 때라도 비디오 디코더가 너무 크게 밀렸거나 튄 경우(1.0초 초과)에만 보정
        const diff = Math.abs(player.currentTime - sourcePlayTime);
        const lastSeekTime = STATE.playerLastSeekTimes[clip.assetId] || 0;
        const now = performance.now();
        if (diff > 1.0 && (now - lastSeekTime > 1000)) {
            if (player.readyState >= 1) {
                try {
                    player.currentTime = sourcePlayTime;
                    STATE.playerLastSeekTimes[clip.assetId] = now;
                } catch (e) {
                    console.warn("drawVideoClip currentTime 설정 실패:", e);
                }
            }
        }
    }

    ctx.save();
    
    // 캔버스 필터 이펙트 구현
    let filterString = '';
    if (clip.effects && clip.effects.length > 0) {
        clip.effects.forEach(eff => {
            if (eff === 'grayscale') filterString += 'grayscale(100%) ';
            else if (eff === 'sepia') filterString += 'sepia(100%) ';
        });
    }
    ctx.filter = filterString.trim() || 'none';

    // 회전 렌더링
    const cx = x + w / 2;
    const cy = y + h / 2;
    ctx.translate(cx, cy);
    
    if (clip.rotation !== 0) {
        ctx.rotate((clip.rotation * Math.PI) / 180);
    }

    // 줌 효과 시뮬레이션
    let finalW = w;
    let finalH = h;
    if (clip.effects && clip.effects.includes('zoom_in')) {
        finalW = w * 1.3;
        finalH = h * 1.3;
    } else if (clip.effects && clip.effects.includes('zoom_out')) {
        finalW = w * 0.8;
        finalH = h * 0.8;
    }

    try {
        // 비디오 효과(grayscale 등)가 있고 브라우저 비디오 텍스처 고속 렌더 버그를 방지하기 위해 버퍼 캔버스를 경유하여 렌더링
        if (clip.effects && clip.effects.length > 0) {
            // 비디오의 본래 해상도에 맞게 버퍼 크기 조절
            const videoW = player.videoWidth || player.width || 640;
            const videoH = player.videoHeight || player.height || 360;
            
            if (filterBufferCanvas.width !== videoW || filterBufferCanvas.height !== videoH) {
                filterBufferCanvas.width = videoW;
                filterBufferCanvas.height = videoH;
            }
            
            // 임시 버퍼에 비디오 프레임을 먼저 그립니다 (필터 없음)
            filterBufferCtx.clearRect(0, 0, videoW, videoH);
            filterBufferCtx.drawImage(player, 0, 0, videoW, videoH);
            
            // 필터가 적용된 버퍼 캔버스를 메인 캔버스에 그립니다.
            ctx.drawImage(filterBufferCanvas, -finalW / 2, -finalH / 2, finalW, finalH);
        } else {
            // 효과가 없을 때는 성능 최적화를 위해 직접 비디오를 그림
            ctx.drawImage(player, -finalW / 2, -finalH / 2, finalW, finalH);
        }
    } catch (e) {
        // 비디오 로드 대기 중 에러 처리
        ctx.fillStyle = '#1e1e24';
        ctx.fillRect(-w/2, -h/2, w, h);
        ctx.fillStyle = '#8e8e93';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('미디어 프레임 로드 중...', 0, 0);
    }

    ctx.restore();
}

// --- 오디오 및 비디오 플레이어 제어 루프 ---
function togglePlayback() {
    if (STATE.isPlaying) {
        pausePlayback();
    } else {
        startPlayback();
    }
}

// 모든 오디오/비디오 플레이어 브라우저 자동재생 락 해제 (웜업)
function unlockAllPlayers() {
    Object.values(activePlayers).forEach(player => {
        if (player.dataset.unlocked === 'true') return;
        
        const prevMuted = player.muted;
        const prevVol = player.volume;
        player.muted = true;
        player.volume = 0;
        
        player.play().then(() => {
            player.pause();
            player.muted = prevMuted;
            player.volume = prevVol;
            player.dataset.unlocked = 'true';
        }).catch(e => {
            // 실패하더라도 인터랙션 웜업 시도가 브라우저에 등록되어 락이 해제될 수 있음
            player.dataset.unlocked = 'true';
        });
    });
}

function startPlayback() {
    if (STATE.isPlaying) return;
    
    // 브라우저 자동재생 보안 제한 해제 (사용자 인터랙션 핸들러 내에서 호출)
    unlockAllPlayers();
    
    // 오디오 컨텍스트 락 릴리즈 방지용 동시 재생 개시
    STATE.isPlaying = true;
    DOM.btnPlay.innerHTML = '<i class="fa-solid fa-pause"></i>';
    STATE.lastTimeUpdate = performance.now();
    
    // 재생 시 음원 동시 기동
    updateActivePlayersStates();
    
    playbackLoop();
}

function pausePlayback() {
    STATE.isPlaying = false;
    DOM.btnPlay.innerHTML = '<i class="fa-solid fa-play"></i>';
    
    if (STATE.lastAnimFrameId) {
        cancelAnimationFrame(STATE.lastAnimFrameId);
    }
    
    // 모두 정지
    pauseAllPlayers();
}

function stopPlayback() {
    pausePlayback();
    STATE.playheadTime = 0;
    updatePlayheadPosition();
    updateTimeDisplay();
    syncHiddenPlayersTime();
    renderPreview();
}

function stepFrame(timeDiff) {
    pausePlayback();
    STATE.playheadTime = Math.max(0, Math.min(STATE.totalDuration, STATE.playheadTime + timeDiff));
    updatePlayheadPosition();
    updateTimeDisplay();
    syncHiddenPlayersTime();
    renderPreview();
}

function playbackLoop() {
    if (!STATE.isPlaying) return;

    const now = performance.now();
    const elapsed = (now - STATE.lastTimeUpdate) / 1000;
    STATE.lastTimeUpdate = now;

    STATE.playheadTime += elapsed;
    
    if (STATE.playheadTime >= STATE.totalDuration - 2.0) {
        // 오버런 방지용 루프 정지
        stopPlayback();
        return;
    }

    updatePlayheadPosition();
    updateTimeDisplay();
    updateActivePlayersStates(); // 활성 상태에 들어가는 비디오들 재생
    renderPreview();

    STATE.lastAnimFrameId = requestAnimationFrame(playbackLoop);
}

// 타임라인 재생 헤드 시간 기준 비디오/오디오 파일 시작/일시정지 동기화
function updateActivePlayersStates() {
    const time = STATE.playheadTime;
    const now = performance.now();
    
    // 음소거 유무 설정
    updateActivePlayersVolumes();

    STATE.assets.forEach(asset => {
        const player = activePlayers[asset.id];
        if (!player) return;

        // 이 자산을 사용하는 클립들 중 현재 재생헤드가 걸치는 클립 탐색
        const activeClip = STATE.clips.find(c => c.assetId === asset.id && time >= c.timelineStart && time < c.timelineStart + c.duration);
        
        if (activeClip && STATE.isPlaying) {
            const clipElapsed = time - activeClip.timelineStart;
            const targetSrcTime = activeClip.sourceStart + clipElapsed;
            
            // 영상 및 음원 재생 싱크 기동
            if (player.paused) {
                if (player.readyState >= 1) {
                    try {
                        player.currentTime = targetSrcTime;
                    } catch (e) {
                        console.warn("updateActivePlayersStates currentTime 설정 실패:", e);
                    }
                }
                player.playbackRate = 1.0; // 속도 초기화
                STATE.playerLastSeekTimes[asset.id] = now;
                player.play().catch(e => console.log("자동재생 실패:", e));
            } else {
                // 재생 속도(playbackRate) 미세 조정을 통한 동기화 (지직거리는 잡음 및 Seek 끊김 방지)
                const diff = player.currentTime - targetSrcTime; // 양수면 플레이어가 빠름, 음수면 느림
                const absDiff = Math.abs(diff);
                
                if (absDiff > 1.5) {
                    // 1.5초 이상으로 크게 차이 날 때만 최후의 수단으로 currentTime 강제 덮어쓰기 (1초 쿨다운 적용)
                    const lastSeekTime = STATE.playerLastSeekTimes[asset.id] || 0;
                    if (now - lastSeekTime > 1000) {
                        if (player.readyState >= 1) {
                            try {
                                player.currentTime = targetSrcTime;
                            } catch (e) {
                                console.warn("updateActivePlayersStates currentTime 설정 실패:", e);
                            }
                        }
                        player.playbackRate = 1.0;
                        STATE.playerLastSeekTimes[asset.id] = now;
                    }
                } else if (absDiff > 0.08) {
                    // 0.08초 ~ 1.5초 편차는 재생 속도를 미세 조절하여 끊김이나 지직거림 없이 동기화
                    if (diff > 0) {
                        player.playbackRate = 0.96; // 플레이어가 빠르므로 속도를 약간 늦춤 (96% 속도)
                    } else {
                        player.playbackRate = 1.04; // 플레이어가 느리므로 속도를 약간 높임 (104% 속도)
                    }
                } else {
                    // 안정 범위 이내면 정상 재생 속도 복구
                    if (player.playbackRate !== 1.0) {
                        player.playbackRate = 1.0;
                    }
                }
            }
        } else {
            if (!player.paused) {
                player.pause();
                player.playbackRate = 1.0; // 일시정지 시 속도 초기화
            }
        }
    });
}

function pauseAllPlayers() {
    Object.values(activePlayers).forEach(player => {
        if (!player.paused) player.pause();
        player.playbackRate = 1.0; // 속도 초기화
    });
}

function syncHiddenPlayersTime() {
    const time = STATE.playheadTime;
    STATE.assets.forEach(asset => {
        const player = activePlayers[asset.id];
        if (!player) return;
        
        const activeClip = STATE.clips.find(c => c.assetId === asset.id && time >= c.timelineStart && time < c.timelineStart + c.duration);
        if (activeClip) {
            const clipElapsed = time - activeClip.timelineStart;
            if (player.readyState >= 1) {
                try {
                    player.currentTime = activeClip.sourceStart + clipElapsed;
                } catch (e) {
                    console.warn("syncHiddenPlayersTime currentTime 설정 실패:", e);
                }
            }
        }
    });
}

function updateActivePlayersVolumes() {
    const time = STATE.playheadTime;
    STATE.assets.forEach(asset => {
        const player = activePlayers[asset.id];
        if (!player) return;

        const activeClip = STATE.clips.find(c => c.assetId === asset.id && time >= c.timelineStart && time < c.timelineStart + c.duration);
        if (activeClip && !STATE.isMuted) {
            // 개별 음량 비율 적용
            const clipVol = activeClip.volume !== undefined ? activeClip.volume : 1.0;
            player.volume = clipVol * STATE.previewVolume;
            
            // 숨겨진 비디오/오디오 엘리먼트 자체의 muted를 해제하여 소리가 나도록 합니다.
            player.muted = false;
        } else {
            player.volume = 0;
            player.muted = true; // 비활성 상태거나 음소거 시 강제 뮤트
        }
    });
}

function toggleMute() {
    STATE.isMuted = !STATE.isMuted;
    updateMuteUI();
    updateActivePlayersVolumes();
}

function updateMuteUI() {
    if (STATE.isMuted) {
        DOM.btnMute.className = 'fa-solid fa-volume-xmark mute-icon muted';
        DOM.previewVolumeSlider.value = 0;
    } else {
        DOM.btnMute.className = 'fa-solid fa-volume-high mute-icon';
        DOM.previewVolumeSlider.value = STATE.previewVolume;
    }
}

function updateTimeDisplay() {
    const currentStr = formatHHMMSS(STATE.playheadTime);
    const totalStr = formatHHMMSS(STATE.totalDuration - 2.0); // 끝 마진 차감 표시
    DOM.timeDisplay.textContent = `${currentStr} / ${totalStr}`;
}

function formatHHMMSS(seconds) {
    if (isNaN(seconds) || seconds < 0) seconds = 0;
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
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
            STATE.clips = data.clips;
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

// --- 프리뷰 캔버스 상의 자막/오버레이/PIP 마우스 드래그 이동 엔진 ---
let draggedCanvasClip = null;
let dragCanvasOffset = { x: 0, y: 0 };

DOM.previewCanvas.addEventListener('mousedown', (e) => {
    const rect = DOM.previewCanvas.getBoundingClientRect();
    const canvasX = e.clientX - rect.left;
    const canvasY = e.clientY - rect.top;
    
    // 640x360 프리뷰 해상도를 1280x720 논리 해상도계로 변환 (2배율)
    const logX = canvasX * 2;
    const logY = canvasY * 2;
    
    const time = STATE.playheadTime;
    
    // 현재 재생 시점에 화면에 노출 중인 클립 필터링
    const activeClips = STATE.clips.filter(c => time >= c.timelineStart && time < c.timelineStart + c.duration);
    
    let foundClip = null;
    
    // 1. 자막 및 이미지 오버레이 영역 충돌 검증 (오버레이가 최상단 레이어이므로 우선)
    const overlays = activeClips.filter(c => c.track === 'overlay').reverse();
    for (const clip of overlays) {
        if (clip.overlayType === 'image') {
            const w = clip.width || 150;
            const h = clip.height || 150;
            if (logX >= clip.x && logX <= clip.x + w && logY >= clip.y && logY <= clip.y + h) {
                foundClip = clip;
                dragCanvasOffset.x = logX - clip.x;
                dragCanvasOffset.y = logY - clip.y;
                break;
            }
        } else if (clip.overlayType === 'text') {
            // 텍스트 자막 충돌 박스 근사값 계산 (글꼴 크기 기준)
            const size = clip.textSize || 36;
            const textWidth = 350; // 기본 한글 텍스트 영역 너비 추정
            const xMin = clip.x === 640 ? 640 - textWidth / 2 : clip.x;
            const xMax = clip.x === 640 ? 640 + textWidth / 2 : clip.x + textWidth;
            const yMin = clip.y - size;
            const yMax = clip.y + size;
            
            if (logX >= xMin && logX <= xMax && logY >= yMin && logY <= yMax) {
                foundClip = clip;
                dragCanvasOffset.x = logX - clip.x;
                dragCanvasOffset.y = logY - clip.y;
                break;
            }
        }
    }
    
    // 2. 비디오 트랙 2 (PIP 오버레이) 검증 (자막 등이 안 찍혔을 경우)
    if (!foundClip) {
        const pipClips = activeClips.filter(c => c.track === 'video2').reverse();
        for (const clip of pipClips) {
            const pip = clip.pip || { width: 320, height: 180, x: 20, y: 20 };
            if (logX >= pip.x && logX <= pip.x + pip.width && logY >= pip.y && logY <= pip.y + pip.height) {
                foundClip = clip;
                dragCanvasOffset.x = logX - pip.x;
                dragCanvasOffset.y = logY - pip.y;
                break;
            }
        }
    }
    
    if (foundClip) {
        draggedCanvasClip = foundClip;
        selectClip(foundClip.id);
        
        window.addEventListener('mousemove', onCanvasMouseMove);
        window.addEventListener('mouseup', onCanvasMouseUp);
    }
});

function onCanvasMouseMove(e) {
    if (!draggedCanvasClip) return;
    
    const rect = DOM.previewCanvas.getBoundingClientRect();
    const canvasX = e.clientX - rect.left;
    const canvasY = e.clientY - rect.top;
    
    const logX = canvasX * 2;
    const logY = canvasY * 2;
    
    // 타겟 좌표 1280x720 안으로 제한
    let newX = Math.round(logX - dragCanvasOffset.x);
    let newY = Math.round(logY - dragCanvasOffset.y);
    
    if (draggedCanvasClip.track === 'video2') {
        // PIP 비디오 좌표
        draggedCanvasClip.pip.x = Math.max(0, Math.min(1280 - (draggedCanvasClip.pip.width || 320), newX));
        draggedCanvasClip.pip.y = Math.max(0, Math.min(720 - (draggedCanvasClip.pip.height || 180), newY));
        
        // 우측 패널 입력란 실시간 값 반사
        DOM.propPipX.value = draggedCanvasClip.pip.x;
        DOM.propPipY.value = draggedCanvasClip.pip.y;
    } else {
        // 자막/이미지 좌표
        draggedCanvasClip.x = Math.max(0, Math.min(1280, newX));
        draggedCanvasClip.y = Math.max(0, Math.min(720, newY));
        
        // 우측 패널 입력란 실시간 값 반사
        DOM.propTextX.value = draggedCanvasClip.x;
        DOM.propTextY.value = draggedCanvasClip.y;
    }
    
    renderPreview();
}

function onCanvasMouseUp() {
    window.removeEventListener('mousemove', onCanvasMouseMove);
    window.removeEventListener('mouseup', onCanvasMouseUp);
    
    draggedCanvasClip = null;
    updateFFmpegCommand();
}
