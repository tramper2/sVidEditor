/**
 * sVidEditor - 프리뷰 렌더러 (Canvas Rendering Engine)
 *
 * 현재 재생헤드 시점의 타임라인 상태를 640x360 프리뷰 캔버스에 실시간 렌더링합니다.
 * 메인 비디오, PIP 비디오, 이미지/텍스트 오버레이를 합성하며,
 * 비디오 효과(grayscale/sepia/zoom) 및 회전 변환을 처리합니다.
 */

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
            const fontFamily = getCanvasFontFamily(clip.textFont);
            ctx.font = `500 ${Math.round((clip.textSize || 36) / 2)}px ${fontFamily}`;
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
    const sourcePlayTime = clip.sourceStart + clipElapsed * (clip.speed || 1.0);

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
