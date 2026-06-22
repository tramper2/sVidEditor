/**
 * sVidEditor - 타임라인 편집 로직
 *
 * 타임라인 클립의 상태를 변경하는 핵심 로직을 담당합니다.
 * 클립 추가/삭제/분할, 클립 선택 및 속성 패널 바인딩, 속성 입력 실시간 반영,
 * 타임라인 총 길이 재계산 등을 처리합니다.
 */

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
        speed: 1.0,
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
        DOM.propSpeed.value = clip.speed || 1.0;
        DOM.propSpeedLabel.textContent = (clip.speed || 1.0).toFixed(1);

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
            DOM.propTextFont.value = clip.textFont || 'malgun';
            DOM.propTextFontCustom.value = clip.textFontCustom || '';
            if (clip.textFont === 'custom') {
                DOM.propTextFontCustomGroup.classList.remove('hide');
            } else {
                DOM.propTextFontCustomGroup.classList.add('hide');
            }
        } else if (clip.overlayType === 'image') {
            DOM.imageOverlaySection.classList.remove('hide');
            DOM.propImgWidth.value = clip.width;
            DOM.propImgHeight.value = clip.height;
        }
    }
}

// 속성 변경 사항 적용
function applyPropertiesChanges() {
    if (!STATE.selectedClipId) return;
    const clip = STATE.clips.find(c => c.id === STATE.selectedClipId);
    if (!clip) return;

    // 로컬 파일명 수집
    clip.localPath = DOM.propLocalPath.value;

    // 배속 처리
    const speed = DOM.propSpeed ? (parseFloat(DOM.propSpeed.value) || 1.0) : 1.0;
    clip.speed = speed;

    // 수치 형변환
    const timelineStart = parseFloat(DOM.propTimelineStart.value) || 0;
    const duration = parseFloat(DOM.propDuration.value) || 0.1;
    const sourceStart = parseFloat(DOM.propSourceStart.value) || 0;

    // 소스 한계치 점검
    if (clip.assetId) {
        const asset = STATE.assets.find(a => a.id === clip.assetId);
        const assetDuration = asset ? asset.duration : 1000.0;
        clip.sourceStart = sourceStart;
        clip.sourceEnd = Math.min(assetDuration, sourceStart + duration * speed);
        clip.duration = parseFloat(((clip.sourceEnd - clip.sourceStart) / speed).toFixed(2));
    } else {
        clip.duration = duration;
        clip.sourceStart = sourceStart;
        clip.sourceEnd = sourceStart + duration * speed;
    }

    clip.timelineStart = timelineStart;

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
            clip.textFont = DOM.propTextFont.value;
            clip.textFontCustom = DOM.propTextFontCustom.value;
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
function updateSelectedClipFromInputs(e) {
    if (!STATE.selectedClipId) return;
    const clip = STATE.clips.find(c => c.id === STATE.selectedClipId);
    if (!clip) return;

    // 로컬 파일 경로
    clip.localPath = DOM.propLocalPath.value;

    // 배속 처리
    const speed = DOM.propSpeed ? (parseFloat(DOM.propSpeed.value) || 1.0) : 1.0;
    clip.speed = speed;
    if (DOM.propSpeedLabel) {
        DOM.propSpeedLabel.textContent = speed.toFixed(1);
    }

    // 타임라인 관련 수치
    const timelineStart = parseFloat(DOM.propTimelineStart.value) || 0;
    clip.timelineStart = timelineStart;

    const asset = clip.assetId ? STATE.assets.find(a => a.id === clip.assetId) : null;
    const assetDuration = asset ? asset.duration : 1000.0;

    if (e && e.target === DOM.propSpeed) {
        // 1. 배속 슬라이더가 조절된 경우: 원본 컷 구간(sourceStart ~ sourceEnd) 고정, 타임라인 출력 지속시간(duration) 변경
        const sourceDur = clip.sourceEnd - clip.sourceStart;
        clip.duration = parseFloat((sourceDur / speed).toFixed(2));
        DOM.propDuration.value = clip.duration;
    } else if (e && e.target === DOM.propDuration) {
        // 2. 타임라인 출력 지속시간이 직접 입력된 경우: 원본 컷 종료(sourceEnd) 변경
        const duration = parseFloat(DOM.propDuration.value) || 0.1;
        clip.sourceEnd = Math.min(assetDuration, clip.sourceStart + duration * speed);
        clip.duration = parseFloat(((clip.sourceEnd - clip.sourceStart) / speed).toFixed(2));
        DOM.propSourceEnd.value = clip.sourceEnd;
    } else if (e && (e.target === DOM.propSourceStart || e.target === DOM.propSourceEnd)) {
        // 3. 원본 컷 시작/종료 지점이 입력된 경우: 타임라인 출력 지속시간(duration) 재계산
        const sourceStart = parseFloat(DOM.propSourceStart.value) || 0;
        const sourceEnd = parseFloat(DOM.propSourceEnd.value) || 0.1;
        clip.sourceStart = Math.min(assetDuration, sourceStart);
        clip.sourceEnd = Math.min(assetDuration, Math.max(clip.sourceStart + 0.1, sourceEnd));
        clip.duration = parseFloat(((clip.sourceEnd - clip.sourceStart) / speed).toFixed(2));

        DOM.propSourceStart.value = clip.sourceStart;
        DOM.propSourceEnd.value = clip.sourceEnd;
        DOM.propDuration.value = clip.duration;
    } else {
        // 4. 드래그 조작 또는 기타 초기 연동: 슬라이더 수치를 그대로 신뢰
        const sourceStart = parseFloat(DOM.propSourceStart.value) || 0;
        const sourceEnd = parseFloat(DOM.propSourceEnd.value) || 0.1;
        clip.sourceStart = sourceStart;
        clip.sourceEnd = sourceEnd;

        if (!e) {
            clip.duration = parseFloat(((clip.sourceEnd - clip.sourceStart) / speed).toFixed(2));
            DOM.propDuration.value = clip.duration;
        } else {
            // 마우스 드래그 트리밍 시에는 mousemove 리스너가 직접 clip.duration을 연산하여 업데이트하므로 값을 덮어쓰지 않음
            const duration = parseFloat(DOM.propDuration.value) || 0.1;
            clip.duration = duration;
        }
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
            clip.textFont = DOM.propTextFont.value;
            clip.textFontCustom = DOM.propTextFontCustom.value;

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

    const speed = clip.speed || 1.0;
    // 전반부/후반부 구간 계산
    const firstPartDuration = splitTime - clip.timelineStart;
    const secondPartDuration = clip.timelineStart + clip.duration - splitTime;

    const originalSourceEnd = clip.sourceEnd;

    // 1. 기존 클립을 앞부분으로 변경
    clip.sourceEnd = parseFloat((clip.sourceStart + firstPartDuration * speed).toFixed(2));
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
