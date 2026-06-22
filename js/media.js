/**
 * sVidEditor - 미디어 파일 임포트 로직
 *
 * 드래그&드롭 또는 파일 선택으로 미디어(비디오/오디오/이미지)를 가져오고,
 * 메타데이터를 읽어 STATE.assets 에 등록하며, 숨겨진 플레이어 엘리먼트를 생성하고
 * 에셋 목록 UI를 갱신합니다.
 */

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
