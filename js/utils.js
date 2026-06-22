/**
 * sVidEditor - 공용 유틸리티 함수
 *
 * 시간 포맷팅, 클립 타입 라벨링, 캔버스 폰트 매핑 등
 * 여러 모듈에서 공통으로 사용하는 순수 헬퍼 함수들을 모아둡니다.
 */

// 초 단위 시간을 "MM:SS.cc" 형식 문자열로 변환
function formatHHMMSS(seconds) {
    if (isNaN(seconds) || seconds < 0) seconds = 0;
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
}

// 클립 종류에 따른 사람 친화적 라벨 반환
function getClipTypeLabel(clip) {
    if (clip.track === 'video1') return "메인 비디오 클립";
    if (clip.track === 'video2') return "PIP 오버레이 비디오";
    if (clip.track === 'audio') return "배경 음악 클립";
    if (clip.overlayType === 'text') return "텍스트 자막";
    return "PNG 이미지 오버레이";
}

/**
 * 선택된 글꼴 키에 매핑되는 브라우저 Canvas 렌더링용 font-family 문자열 반환
 */
function getCanvasFontFamily(fontKey) {
    switch (fontKey) {
        case 'malgun':
            return "'Malgun Gothic', 'Noto Sans KR', sans-serif";
        case 'gulim':
            return "'Gulim', 'GulimChe', sans-serif";
        case 'batang':
            return "'Batang', 'BatangChe', serif";
        case 'arial':
            return "'Arial', sans-serif";
        default:
            return "'Malgun Gothic', 'Noto Sans KR', 'Outfit', sans-serif";
    }
}
