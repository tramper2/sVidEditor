/**
 * sVidEditor - 프리뷰 캔버스 드래그 이동 엔진 및 패널 크기 조절
 *
 * 프리뷰 캔버스 위의 자막/이미지 오버레이/PIP 비디오를 마우스 드래그로 직접 이동하고
 * 우측 속성 패널 입력란에 실시간 반영합니다.
 * 또한 좌측/중앙/우측 패널과 타임라인의 크기를 드래그로 조절합니다.
 */

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

/* ========================================================================
   패널 크기 조절 (Resizable Panels)
   ======================================================================== */
function initResizablePanels() {
    const DEFAULTS = {
        'left-center':    { defaultSize: 300, min: 180, max: 600 },
        'preview-script': { defaultSize: 340, min: 180, max: 700 },
        'center-right':   { defaultSize: 340, min: 220, max: 600 },
        'main-timeline':  { defaultSize: 280, min: 150, max: 600 }
    };

    const handles = document.querySelectorAll('.resize-handle');
    let activeHandle = null;
    let startX = 0;
    let startY = 0;
    let startSize = 0;
    let targetElement = null;

    handles.forEach(handle => {
        // 드래그 시작
        handle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();

            activeHandle = handle;
            const handleId = handle.dataset.handle;

            if (handleId === 'left-center') {
                targetElement = document.getElementById('panel-media');
                startX = e.clientX;
                startSize = targetElement.offsetWidth;
                document.body.classList.add('resizing');
            } else if (handleId === 'preview-script') {
                targetElement = document.querySelector('.ffmpeg-script-container');
                startX = e.clientX;
                startSize = targetElement.offsetWidth;
                document.body.classList.add('resizing');
            } else if (handleId === 'center-right') {
                targetElement = document.getElementById('panel-properties');
                startX = e.clientX;
                startSize = targetElement.offsetWidth;
                document.body.classList.add('resizing');
            } else if (handleId === 'main-timeline') {
                targetElement = document.querySelector('.app-timeline');
                startY = e.clientY;
                startSize = targetElement.offsetHeight;
                document.body.classList.add('resizing-row');
            }

            handle.classList.add('active');
            document.addEventListener('mousemove', onResizeMove);
            document.addEventListener('mouseup', onResizeEnd);
        });

        // 더블클릭으로 기본 크기 복원
        handle.addEventListener('dblclick', () => {
            const handleId = handle.dataset.handle;
            const config = DEFAULTS[handleId];
            let el;

            if (handleId === 'left-center') {
                el = document.getElementById('panel-media');
            } else if (handleId === 'preview-script') {
                el = document.querySelector('.ffmpeg-script-container');
            } else if (handleId === 'center-right') {
                el = document.getElementById('panel-properties');
            } else if (handleId === 'main-timeline') {
                el = document.querySelector('.app-timeline');
            }

            if (el) {
                el.style.flex = `0 0 ${config.defaultSize}px`;
                drawRuler();
            }
        });
    });

    // 드래그 이동
    function onResizeMove(e) {
        if (!activeHandle || !targetElement) return;

        const handleId = activeHandle.dataset.handle;
        const config = DEFAULTS[handleId];
        let newSize;

        if (handleId === 'left-center') {
            // 좌측 패널: 오른쪽으로 드래그 → 확대
            newSize = startSize + (e.clientX - startX);
        } else if (handleId === 'preview-script') {
            // FFmpeg 스크립트: 오른쪽으로 드래그 → 축소
            newSize = startSize - (e.clientX - startX);
        } else if (handleId === 'center-right') {
            // 우측 패널: 오른쪽으로 드래그 → 축소
            newSize = startSize - (e.clientX - startX);
        } else if (handleId === 'main-timeline') {
            // 타임라인: 위로 드래그 → 확대
            newSize = startSize + (startY - e.clientY);
        }

        const clamped = Math.max(config.min, Math.min(config.max, newSize));
        targetElement.style.flex = `0 0 ${clamped}px`;
    }

    // 드래그 종료
    function onResizeEnd() {
        if (activeHandle) {
            activeHandle.classList.remove('active');
        }

        activeHandle = null;
        targetElement = null;

        document.body.classList.remove('resizing');
        document.body.classList.remove('resizing-row');

        document.removeEventListener('mousemove', onResizeMove);
        document.removeEventListener('mouseup', onResizeEnd);

        // 레이아웃 변경 후 타임라인 눈금자 다시 그리기
        drawRuler();
    }
}
