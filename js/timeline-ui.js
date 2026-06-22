/**
 * sVidEditor - 타임라인 UI 렌더링 및 조작 (드래그&이동)
 *
 * 줌 슬라이더, 룰러(Canvas) 그리기, 스크러빙, 재생헤드 위치 갱신,
 * 비디오1 트랙 자석 정렬, 타임라인 클립 DOM 렌더링 및 트리밍/드래그 인터랙션,
 * 효과 라이브러리(.effect-item) 드래그·클릭 바인딩을 담당합니다.
 */

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

        const speedLabel = (clip.track === 'video1' || clip.track === 'video2') ? `<span class="clip-speed-badge">${(clip.speed || 1.0).toFixed(1)}x</span>` : '';

        el.innerHTML = `
            <div class="trim-handle trim-handle-left"></div>
            <span class="clip-name">${clip.name || (clip.overlayType === 'text' ? clip.text : '이미지')} ${speedLabel}</span>
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

                    const speed = clip.speed || 1.0;
                    if (isLeftHandle) {
                        // 왼쪽 에지 드래그 (시작 위치 변경 및 트리밍 확대/축소)
                        let newStart = startLeft + diffTime;
                        let newSrcStart = startSrcStart + diffTime * speed;

                        if (newSrcStart < 0) {
                            newStart = startLeft - startSrcStart / speed;
                            newSrcStart = 0;
                        }
                        if (newStart < 0) {
                            newStart = 0;
                            newSrcStart = startSrcStart - startLeft * speed;
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
                        let newSrcEnd = startSrcEnd + diffTime * speed;

                        if (newSrcEnd > assetDuration) {
                            newSrcEnd = assetDuration;
                            newDur = (assetDuration - startSrcStart) / speed;
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
