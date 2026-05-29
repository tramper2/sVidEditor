# sVidEditor 개발 완료 결과 보고서 (Walkthrough)

로컬 렌더링 방식의 웹 동영상 편집기 **sVidEditor**의 모든 핵심 기능 및 추가 수정 작업(타임라인 드래그 오류 수정, 자석식 밀착 정렬 & 스왑 알고리즘 최적화, 자막/오버레이 시간 길이 트림/조절, 프리뷰 모니터 직접 드래그, FFmpeg 실시간 명령어 매핑 검증, 윈도우 인코딩 오류 차단)을 완료하고 배포했습니다.

개발된 소스 코드 파일들은 **`D:\Study\WebPage\sVidEditor`** 폴더에 배치되었으며, 웹 브라우저에서 편리하게 더블 클릭하여 즉시 실행이 가능하도록 모듈 로더 의존성을 제거하여 개발되었습니다.

---

## 1. 프로젝트 파일 목록 및 구조

프로젝트 폴더 내 구성 요소와 역할은 다음과 같습니다.

*   **[index.html](file:///D:/Study/WebPage/sVidEditor/index.html)**: 미디어 라이브러리, 프리뷰 플레이어, 트랙 타임라인, 클립 속성 설정 창 및 FFmpeg 명령어 콘솔 창을 배치한 싱글 페이지 애플리케이션 마크업입니다.
*   **[style.css](file:///D:/Study/WebPage/sVidEditor/style.css)**: Outfit 폰트를 활용한 다크 테마 UI 스타일시트입니다. 글래스모피즘 스타일 카드와 스크러빙이 가능한 정밀한 눈금자, 트랙 레인 및 조작 핸들 등을 정의합니다.
*   **[app.js](file:///D:/Study/WebPage/sVidEditor/app.js)**: 타임라인 데이터의 상태 관리(State), 미디어 파일 임포트, 재생 제어, 캔버스 기반의 복합 실시간 드로잉 및 드래그 앤 드롭 편집 로직을 총괄하는 메인 엔진입니다.
*   **[ffmpeg-generator.js](file:///D:/Study/WebPage/sVidEditor/ffmpeg-generator.js)**: 사용자의 타임라인 상태값을 읽어서 비디오 결합, 오디오 믹싱, 자막 합성 및 PIP 배치가 통합된 복잡한 Windows FFmpeg 필터 체인 명령어와 실행 배치 파일(`.bat`)을 실시간 컴파일하는 핵심 라이브러리입니다.
*   **[README.md](file:///D:/Study/WebPage/sVidEditor/README.md)**: 배포 링크와 사용 설명이 기재된 마스터 가이드라인 문서입니다.
*   **[Doc/](file:///D:/Study/WebPage/sVidEditor/Doc)**: 개발 관련 주요 가이드 및 설계 문서 보관 폴더입니다.
    *   **[Doc/implementation_plan.md](file:///D:/Study/WebPage/sVidEditor/Doc/implementation_plan.md)**: 기술 구현 기획서
    *   **[Doc/task.md](file:///D:/Study/WebPage/sVidEditor/Doc/task.md)**: 개발 작업 목록
    *   **[Doc/walkthrough.md](file:///D:/Study/WebPage/sVidEditor/Doc/walkthrough.md)**: 본 결과 보고서 및 상세 가이드
*   **[ffmpeg/README.txt](file:///D:/Study/WebPage/sVidEditor/ffmpeg/README.txt)**: 로컬 렌더링에 필수적인 `ffmpeg.exe` 및 `ffprobe.exe` 바이너리를 다운로드하고 저장해야 할 위치를 설명하는 가이드라인 문서입니다.
*   **[.gitignore](file:///D:/Study/WebPage/sVidEditor/.gitignore)**: 대용량 영상 리소스 및 실행 파일, 생성된 임시 스크립트 등이 깃허브에 커밋되어 충돌을 일으키지 않도록 사전에 방지하는 룰셋입니다.
*   **[deploy.sh](file:///D:/Study/WebPage/sVidEditor/deploy.sh)** (Bash용) / **[deploy.bat](file:///D:/Study/WebPage/sVidEditor/deploy.bat)** (Windows CMD용): `git@github.com:tramper2/sVidEditor.git` 저장소의 `gh-pages` 브랜치로 자동 푸시하여 배포해 주는 실행 스크립트 파일입니다.

---

## 2. 구현된 핵심 기능의 기술적 세부사항 (최근 수정사항 반영)

### ① 드래그 앤 드롭을 이용한 타임라인 편집
*   **브라우저 기본 간섭 제거**: 클립 드래그 조작 시 웹 브라우저 고유의 HTML5 텍스트/이미지 드래그앤드롭 세션이 활성화되어 standard `mousemove` 이벤트가 끊기는 오동작을 수정했습니다 (`e.preventDefault()` 적용).
*   **비디오 트랙 1 (자석 정렬 & 스왑)**: 메인 트랙에 배치된 비디오 클립들은 드래그하여 순서를 자유롭게 교체할 수 있습니다. 활성화된(드래그 중인) 클립에 작은 마이너스 정렬 가중치 오프셋을 두어 스왑 알고리즘이 부드럽게 작동합니다.
*   **서브 트랙 (비디오 트랙 2 / 오디오 / 자막 / 오버레이 이미지)**: 이 트랙들에 배치되는 클립들은 메인 트랙과 달리 **자유 드래그 방식**으로 원하는 특정 타임라인 시간대(`timelineStart`)에 드래그하여 정확하게 올리고 변경할 수 있습니다.

### ② 자막 입력 및 원하는 시간대 조절 (Start/Duration)
*   **타이핑 동기화**: 우측 속성 패널에서 텍스트 입력만으로 자막 내용이 실시간으로 캔버스 프리뷰 및 FFmpeg 명령어에 입력됩니다.
*   **끝단 조절 핸들 드래그**: 자막 및 이미지 오버레이 클립의 가장자리(좌/우 끝부분)에 마우스를 가져가면 드래그하여 시작 시간 및 지속 시간(`duration`)을 자유롭게 줄이고 늘릴 수 있습니다.
*   **속성창 정밀 제어**: 숫자로 정교하게 조절하고 싶은 사용자를 위해, 시작 시간(`Start Time`)과 지속 시간(`Duration`)을 속성창의 숫자 입력 칸에 타이핑하여 동시 제어할 수 있습니다.

### ③ 프리뷰 화면 모니터 직접 드래그 이동 (WYSIWYG)
*   사용자가 프리뷰 플레이어 화면 상에 나타나는 **자막 텍스트, 이미지 스티커, 혹은 PIP 동영상(Track 2)을 직접 마우스로 잡고 원하는 위치로 드래그**할 수 있습니다.
*   드래그한 좌표값은 우측 속성 창의 X, Y 입력창에 실시간 수치로 연동되며, 동시에 하단의 FFmpeg 렌더링 스크립트에 반영됩니다.

### ④ FFmpeg 렌더링 명령어 치환 검증 완료
브라우저에서 마우스 조작과 타이핑으로 만들어낸 결과물들이 FFmpeg 변환 엔진(`ffmpeg-generator.js`)을 통해 오차 없이 정상 변환됨을 확인했습니다.
*   **결합 순서**: 비디오 트랙 1의 클립 스왑 결과에 따라 인풋 리소스 인덱스가 알맞게 빌드되고 `concat` 필터 순서에 결합됩니다.
*   **PIP(Track 2) 및 오버레이 이미지**: 해당 클립의 시작/종료 시간에 맞춰 `overlay=x:y:enable='between(t,Start,End)'` 필터가 자동으로 생성됩니다. 화면 드래그로 조절된 X, Y 좌표는 `overlay` 필터의 좌표 매개변수에 매핑됩니다.
*   **텍스트 자막**: 사용자가 지정한 시작/종료 시간 및 화면 좌표를 매핑하여 `drawtext=text='자막내용':x=X:y=Y:enable='between(t,Start,End)'` 필터로 정확히 변환됩니다. (가독성을 위해 테두리 옵션인 `borderw=2:bordercolor=black`이 함께 제공됩니다.)

### ⑤ Windows CMD 한글 바이트 인코딩 깨짐 해결
*   배치파일 실행 시 한글 깨짐과 괄호 `( )` 오인식으로 인한 스크립트 강제 종료 현상을 완벽히 보완하기 위해 `render.bat`을 순수 ASCII 영어 코드로 생성하여 인코딩 오류 가능성을 100% 제거했습니다.

---

## 3. 최종 사용자 실행 및 검증 가이드

### 단계 1: 미디어 파일 추가 및 로컬 경로 지정
1. `D:\Study\WebPage\sVidEditor\index.html` 파일을 웹 브라우저로 엽니다.
2. 좌측 상단 드롭존을 통해 파일들을 선택해 미디어 라이브러리에 등록합니다.
3. 비디오 트랙 1에 영상을 배치하고 스왑해보며 순서 교체가 잘 되는지 테스트합니다.
4. 비디오 트랙 2 또는 자막/오버레이 트랙에 클립을 올리고 드래그하여 임의의 위치로 이동해 봅니다. 자막 글자 입력 후 자막 클립 끝단을 잡고 원하는 길이로 시간을 맞춰 봅니다.
5. 프리뷰 모니터 상의 자막이나 이미지를 마우스로 잡고 끌어 위치를 변경해 봅니다.
6. 우측 속성 창에 표시되는 **'로컬 전체 경로'**가 실제 PC 내부 경로와 동일한지 최종 확인하고 맞게 수정해 줍니다.

### 단계 2: 렌더링 배치 파일 다운로드 및 실행
1. 에디팅을 마치고 우측 상단의 **`렌더링 배치파일 내보내기`** 버튼을 누릅니다.
2. 다운로드된 `render.bat` 파일을 프로젝트 루트 폴더(`D:\Study\WebPage\sVidEditor`)에 넣습니다.
3. `ffmpeg.exe`와 `ffprobe.exe`가 `D:\Study\WebPage\sVidEditor\ffmpeg\` 폴더 안에 다운로드되어 배치되어 있는지 확인합니다.
4. `render.bat`을 더블 클릭하여 실행합니다. 렌더링이 완료되면 `D:\Study\WebPage\sVidEditor\output\` 폴더에 최종 완성본 영상 파일이 생성됩니다.
