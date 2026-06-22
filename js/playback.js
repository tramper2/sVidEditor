/**
 * sVidEditor - 오디오 및 비디오 플레이어 제어 루프
 *
 * 재생/일시정지/정지, 프레임 단위 이동, requestAnimationFrame 기반 재생 루프,
 * 숨겨진 미디어 플레이어들의 시간/속도/음량 싱크, 음소거 UI 등을 담당합니다.
 */

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
            const speed = activeClip.speed || 1.0;
            const targetSrcTime = activeClip.sourceStart + clipElapsed * speed;

            // 영상 및 음원 재생 싱크 기동
            if (player.paused) {
                if (player.readyState >= 1) {
                    try {
                        player.currentTime = targetSrcTime;
                    } catch (e) {
                        console.warn("updateActivePlayersStates currentTime 설정 실패:", e);
                    }
                }
                player.playbackRate = speed; // 속도 적용
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
                        player.playbackRate = speed;
                        STATE.playerLastSeekTimes[asset.id] = now;
                    }
                } else if (absDiff > 0.08) {
                    // 0.08초 ~ 1.5초 편차는 재생 속도를 미세 조절하여 끊김이나 지직거림 없이 동기화
                    if (diff > 0) {
                        player.playbackRate = speed * 0.96; // 플레이어가 빠르므로 속도를 약간 늦춤 (96% 속도)
                    } else {
                        player.playbackRate = speed * 1.04; // 플레이어가 느리므로 속도를 약간 높임 (104% 속도)
                    }
                } else {
                    // 안정 범위 이내면 정상 재생 속도 복구
                    if (player.playbackRate !== speed) {
                        player.playbackRate = speed;
                    }
                }
            }
        } else {
            if (!player.paused) {
                player.pause();
                player.playbackRate = 1.0; // 속도 초기화
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
            const speed = activeClip.speed || 1.0;
            if (player.readyState >= 1) {
                try {
                    player.currentTime = activeClip.sourceStart + clipElapsed * speed;
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
