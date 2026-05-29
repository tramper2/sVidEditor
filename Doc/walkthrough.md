# sVidEditor 개발 완료 결과 보고서 (Walkthrough)

로컬 렌더링 방식의 웹 동영상 편집기 **sVidEditor**의 모든 핵심 기능 및 추가 수정 작업(타임라인 드래그 오류 수정, 자석식 밀착 정렬 & 스왑 알고리즘 최적화, 자막/오버레이 시간 길이 트림/조절, 프리뷰 모니터 직접 드래그, 사용자 정의 출력 해상도 및 FPS 설정 UI 추가 및 FFmpeg 컴파일러 연동, **브라우저 재생 불가 파일 포맷 강제 임포트 및 확장자 감지 예외 처리 완료**, **drawRuler 정의부 복구 및 가로 스크롤 연동 리렌더링 버그 수정**, FFmpeg 실시간 명령어 매핑 검증, 윈도우 인코딩 오류 차단)을 완료하고 배포했습니다.

개발된 소스 코드 파일들은 **`D:\Study\WebPage\sVidEditor`** 폴더에 배치되었으며, 웹 브라우저에서 편리하게 더블 클릭하여 즉시 실행이 가능하도록 모듈 로더 의존성을 제거하여 개발되었습니다.

---

## 1. 프로젝트 파일 목록 및 구조

프로젝트 폴더 내 구성 요소와 역할은 다음과 같습니다.

*   **[index.html](file:///D:/Study/WebPage/sVidEditor/index.html)**: 미디어 라이브러리, 프리뷰 플레이어, 트랙 타임라인, 클립 속성 설정 창, 출력 세팅 드롭다운 바 및 FFmpeg 명령어 콘솔 창을 배치한 싱글 페이지 애플리케이션 마크업입니다.
*   **[style.css](file:///D:/Study/WebPage/sVidEditor/style.css)**: Outfit 폰트를 활용한 다크 테마 UI 스타일시트입니다. 글래스모피즘 스타일 카드와 스크러빙이 가능한 정밀한 눈금자, 트랙 레인 및 조작 핸들, 그리고 헤더에 위치한 출력 설정 셀렉터의 비주얼을 정의합니다.
*   **[app.js](file:///D:/Study/WebPage/sVidEditor/app.js)**: 타임라인 데이터의 상태 관리(State), 미디어 파일 임포트, 재생 제어, 캔버스 기반의 복합 실시간 드로잉 및 드래그 앤 드롭 편집 로직을 총괄하고 출력 해상도/프레임 값 변경 이벤트를 실시간 연동하는 메인 엔진입니다.
*   **[ffmpeg-generator.js](file:///D:/Study/WebPage/sVidEditor/ffmpeg-generator.js)**: 사용자의 타임라인 상태값과 사용자가 정한 출력 크기/프레임 값을 읽어서 비디오 결합, 규격화 리사이징, 오디오 믹싱, 자막 합성 및 PIP 배치가 통합된 복잡한 Windows FFmpeg 필터 체인 명령어와 실행 배치 파일(`.bat`)을 실시간 컴파일하는 핵심 라이브러리입니다.
*   **[README.md](file:///D:/Study/WebPage/sVidEditor/README.md)**: 배포 링크와 사용 설명이 기재된 마스터 가이드라인 문서입니다.
*   **[Doc/](file:///D:/Study/WebPage/sVidEditor/Doc)**: 개발 관련 주요 가이드 및 설계 문서 보관 폴더입니다.
    *   **[Doc/implementation_plan.md](file:///D:/Study/WebPage/sVidEditor/Doc/implementation_plan.md)**: 기술 구현 기획서
    *   **[Doc/task.md](file:///D:/Study/WebPage/sVidEditor/Doc/task.md)**: 개발 작업 목록
    *   **[Doc/walkthrough.md](file:///D:/Study/WebPage/sVidEditor/Doc/walkthrough.md)**: 본 결과 보고서 및 상세 가이드
*   **[ffmpeg/README.txt](file:///D:/Study/WebPage/sVidEditor/ffmpeg/README.txt)**: 로컬 렌더링에 필수적인 `ffmpeg.exe` 및 `ffprobe.exe` 바이너리를 다운로드하고 저장해야 할 위치를 설명하는 가이드라인 문서입니다.
*   **[.gitignore](file:///D:/Study/WebPage/sVidEditor/.gitignore)**: 대용량 영상 리소스 및 실행 파일, 생성된 임시 스크립트 등이 깃허브에 커밋되어 충돌을 일으키지 않도록 사전에 방지하는 룰셋입니다.
*   **[deploy.sh](file:///D:/Study/WebPage/sVidEditor/deploy.sh)** (Bash용) / **[deploy.bat](file:///D:/Study/WebPage/sVidEditor/deploy.bat)** (Windows CMD용): `git@github.com:tramper2/sVidEditor.git` 저장소의 `gh-pages` 브랜치로 자동 푸시하여 배포해 주는 실행 스크립트 파일입니다.

---

## 2. 구현된 핵심 기능의 기술적 세부사항 (미지원 코덱 처리 반영)

### ① 브라우저 미지원 비디오/오디오 파일 강제 임포트 구현
*   **예외 복구 메커니즘**: 브라우저 보안 및 HTML5 엔진 한계로 인해 AVI, MKV, WMV, FLAC, WMA 등의 특정 코덱/컨테이너 파일은 `onloadedmetadata` 이벤트가 기동되지 않고 `onerror` 에러가 발생합니다. 기존에는 이 경우 파일을 버렸으나, 현재는 **기본 지속 시간(10초) 할당 및 `isPreviewDisabled` 속성을 덧붙여 강제 로딩**합니다.
*   **확장자 기반 포맷 구분**: 브라우저가 MIME 타입(`file.type`)을 인식하지 못하고 공란으로 줄 경우, 파일명 확장자(`.mp3`, `.wav`, `.m4a`, `.aac`, `.flac`, `.wma` 등)를 순차 검사하여 정확한 트랙(오디오 트랙)에 할당되도록 보완했습니다.
*   **대체 경고 화면 캔버스 렌더링**: `isPreviewDisabled` 플래그가 설정된 클립이 재생 지점에 도달하면, 검은색 캔버스 배경에 붉은 테두리와 함께 `브라우저 프리뷰 불가 포맷 (로컬 FFmpeg 렌더링 지원됨)` 메시지가 깔끔하게 표시됩니다. 브라우저가 영상을 재생하지 못하더라도 사용자는 타임라인 드래그 조작을 정상 수행할 수 있습니다.

### ② 사용자 정의 동영상 출력 해상도 및 프레임(FPS) 제어
*   상단 헤더 영역에 직관적인 '출력 해상도' 셀렉터(FHD 1080p, HD 720p, 세로형 9:16 1080x1920, SD 360p)와 '출력 프레임' 셀렉터(60fps, 30fps, 24fps)를 연동했습니다.

### ③ 드래그 앤 드롭을 이용한 타임라인 편집
*   클립 드래그 조작 시 웹 브라우저 고유의 HTML5 텍스트/이미지 드래그앤드롭 세션이 활성화되어 standard `mousemove` 이벤트가 끊기는 오동작을 수정했습니다 (`e.preventDefault()` 적용).

### ④ 자막 입력 및 원하는 시간대 조절 (Start/Duration)
*   우측 속성 패널에서 텍스트 입력만으로 자막 내용이 실시간으로 캔버스 프리뷰 및 FFmpeg 명령어에 입력됩니다. 자막 클립 가장자리 핸들 드래그를 통해 재생 시간대와 지속 시간을 자유롭게 조절할 수 있습니다.

### ⑤ 프리뷰 화면 모니터 직접 드래그 이동 (WYSIWYG)
*   사용자가 프리뷰 플레이어 화면 상에 나타나는 자막 텍스트, 이미지 스티커, 혹은 PIP 동영상(Track 2)을 직접 마우스로 잡고 원하는 위치로 드래그할 수 있습니다. X, Y 좌표값은 우측 속성 창 및 하단의 FFmpeg 렌더링 스크립트에 실시간 연동됩니다.

### ⑥ 타임라인 눈금자 그리기 함수 (drawRuler) 위치 오류 수정 및 스크러빙(scrub) 복구
*   **시작 위치 오프셋(140px) 제거**: Canvas가 트랙 라벨 레이아웃 공간(140px) 오른쪽에 flex-grow로 정확히 배치되어 물리 원점(x=0)이 이미 타임라인 0초 지점과 수직으로 맞닿아 있었습니다. 이 구조를 간과하고 `140px` 가로 오프셋을 강제로 더해 그리던 버그를 정정하여, 눈금자의 시작점이 메인 비디오 트랙 라인 시작 위치와 한 치의 오차도 없이 일치하도록 수정했습니다.
*   **스크러빙(scrub) 기능 복구**: 마우스 드래그를 통해 눈금자 영역을 긁을 때 재생헤드를 이동시키는 핵심 함수인 `scrub(e)`가 유실되었던 현상을 탐지해 완벽히 재구현 및 복구했습니다.
*   **가로 스크롤 이벤트 바인딩**: 타임라인을 가로로 스크롤할 때 눈금자도 실시간으로 트랙들과 정교하게 연동되어 흘러가도록 `timelineScrollContainer`에 `scroll` 리스너를 연동했습니다.

---

## 3. 최종 사용자 실행 및 검증 가이드

### 단계 1: 미디어 파일 추가 및 로컬 경로 지정
1. `D:\Study\WebPage\sVidEditor\index.html` 파일을 웹 브라우저로 엽니다.
2. 브라우저 지원 여부와 관계없이 MKV, AVI, WMV 등 로컬 폴더에 위치한 비디오 및 오디오 파일들을 드래그 앤 드롭으로 등록합니다.
3. 목록에 잘 들어갔는지 보고, 타임라인에 배치합니다. 프리뷰 모니터에 프리뷰 불가 박스가 예쁘게 그려지는지 점검합니다.
4. 우측 속성 창에 표시되는 **'로컬 전체 경로'**가 실제 PC 내부 경로와 동일한지 최종 확인하고 맞게 수정해 줍니다. 브라우저에서 읽지 못하더라도 FFmpeg가 경로를 읽어서 올바르게 파일 처리를 수행하게 됩니다.

### 단계 2: 렌더링 배치 파일 다운로드 및 실행
1. 편집을 모두 마친 뒤 우측 상단의 **`렌더링 배치파일 내보내기`** 버튼을 누릅니다.
2. 다운로드된 `render.bat` 파일을 프로젝트 루트 폴더 (`D:\Study\WebPage\sVidEditor`)에 넣습니다.
3. `ffmpeg.exe`와 `ffprobe.exe`가 `D:\Study\WebPage\sVidEditor\ffmpeg\` 폴더 안에 다운로드되어 배치되어 있는지 확인합니다.
4. `render.bat`을 더블 클릭하여 실행합니다. 렌더링이 완료되면 `D:\Study\WebPage\sVidEditor\output\` 폴더에 최종 완성본 영상 파일이 생성됩니다.
