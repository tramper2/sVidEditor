/**
 * sVidEditor - 애플리케이션 진입점 (부트스트랩)
 *
 * DOM 이 완전히 로드된 후 애플리케이션을 초기화합니다.
 * initApp() 은 이벤트 리스너 바인딩, 초기 드로잉, 패널 리사이저 초기화를 수행합니다.
 *
 * 주의: 이 파일은 반드시 모든 모듈 파일(state / utils / media / timeline-core /
 * timeline-ui / preview / playback / ffmpeg-io / canvas-interaction / ffmpeg-generator)
 * 이 로드된 이후에 마지막으로 실행되어야 합니다.
 * setupEventListeners() 가 각 모듈의 전역 함수들을 참조하기 때문입니다.
 */

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

    // 3. 패널 크기 조절 기능 초기화
    initResizablePanels();
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
        DOM.propVolume, DOM.propSpeed, DOM.propPipWidth, DOM.propPipHeight,
        DOM.propPipX, DOM.propPipY, DOM.propAudioVolume,
        DOM.propTextContent, DOM.propTextSize, DOM.propTextColor,
        DOM.propTextFont, DOM.propTextFontCustom,
        DOM.propImgWidth, DOM.propImgHeight, DOM.propTextX, DOM.propTextY
    ];
    propInputs.forEach(input => {
        if (input) {
            input.addEventListener('input', updateSelectedClipFromInputs);
            input.addEventListener('change', updateSelectedClipFromInputs);
        }
    });

    // 배속 프리셋 버튼 이벤트 바인딩
    if (DOM.speedPresets) {
        DOM.speedPresets.forEach(btn => {
            btn.addEventListener('click', () => {
                if (DOM.propSpeed) {
                    DOM.propSpeed.value = btn.dataset.speed;
                    // input 및 change 이벤트 강제 기동하여 값 갱신 연동
                    DOM.propSpeed.dispatchEvent(new Event('input', { bubbles: true }));
                    DOM.propSpeed.dispatchEvent(new Event('change', { bubbles: true }));
                }
            });
        });
    }

    // 폰트 셀렉트 체인지에 따른 직접입력 창 토글
    if (DOM.propTextFont) {
        DOM.propTextFont.addEventListener('change', (e) => {
            if (e.target.value === 'custom') {
                DOM.propTextFontCustomGroup.classList.remove('hide');
            } else {
                DOM.propTextFontCustomGroup.classList.add('hide');
            }
            updateSelectedClipFromInputs();
        });
    }

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
