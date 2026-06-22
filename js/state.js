/**
 * sVidEditor - 전역 상태 및 DOM 캐시
 *
 * 애플리케이션 전반에서 공유되는 STATE, DOM 요소 참조, Canvas 컨텍스트,
 * 숨겨진 미디어 플레이어 맵을 정의합니다.
 *
 * 주의: 이 파일은 가장 먼저 로드되어야 합니다.
 * STATE/DOM/ctx 등은 최상위 const 로 선언되어 TDZ 가 적용되므로,
 * 다른 모듈 파일들이 이들을 참조하려면 반드시 이 파일이 먼저 평가되어야 합니다.
 */

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
    propSpeed: document.getElementById('prop-speed'),
    propSpeedLabel: document.getElementById('prop-speed-label'),
    speedPresets: document.querySelectorAll('.btn-preset'),
    propPipWidth: document.getElementById('prop-pip-width'),
    propPipHeight: document.getElementById('prop-pip-height'),
    propPipX: document.getElementById('prop-pip-x'),
    propPipY: document.getElementById('prop-pip-y'),
    propAudioVolume: document.getElementById('prop-audio-volume'),
    propAudioVolumeLabel: document.getElementById('prop-audio-volume-label'),
    propTextContent: document.getElementById('prop-text-content'),
    propTextSize: document.getElementById('prop-text-size'),
    propTextColor: document.getElementById('prop-text-color'),
    propTextFont: document.getElementById('prop-text-font'),
    propTextFontCustomGroup: document.getElementById('prop-text-font-custom-group'),
    propTextFontCustom: document.getElementById('prop-text-font-custom'),
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
