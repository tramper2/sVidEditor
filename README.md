# sVidEditor - 로컬 렌더링 기반 웹 비디오 에디터

sVidEditor는 웹 브라우저에서 편리하게 비디오/오디오/이미지를 타임라인 형태로 배치하고 효과(회전, 필터, 줌, PIP, 자막 등)를 편집한 후, 실제 인코딩 및 렌더링은 로컬 컴퓨터의 **FFmpeg**를 이용하여 처리하는 하이브리드 비디오 편집기입니다.

브라우저 보안 제약으로 웹에서 직접 대용량 원본을 다루기 힘든 문제를 극복하고, 프리뷰는 브라우저 내부에서 HTML5 Canvas/Audio로 실행하되, 실제 결과물은 PC의 그래픽카드/CPU와 FFmpeg를 이용해 빠르고 안정적으로 렌더링합니다.

---

## 📂 프로젝트 구조

```text
sVidEditor/
│
├── index.html          # 에디터 UI 및 메인 마크업
├── style.css           # 모던 다크 테마 및 컴포넌트 스타일시트
├── app.js              # 타임라인 조작 및 브라우저 프리뷰 엔진
├── ffmpeg-generator.js # FFmpeg 명령어 및 윈도우 배치파일(.bat) 컴파일러
│
├── Doc/                # 프로젝트 설계 및 설명 문서 폴더
│   ├── implementation_plan.md # 기술 구현 기획서
│   ├── task.md                # 개발 작업 목록
│   └── walkthrough.md         # 개발 결과 보고서 및 상세 가이드
│
├── ffmpeg/
│   └── README.txt      # 로컬 FFmpeg 설치 및 배치 방법 안내서
│
├── source/             # [로컬 전용] 사용자 원본 영상 저장 폴더 (.gitkeep)
├── output/             # [로컬 전용] 최종 렌더링된 인코딩 비디오 저장 폴더 (.gitkeep)
│
├── deploy.sh           # GitHub Pages 배포 자동화 셸 스크립트
├── deploy.bat          # GitHub Pages 배포 자동화 Windows 배치 스크립트
└── .gitignore          # 대용량 미디어 및 로컬 실행 파일 커밋 제외 룰셋
```

---

## ⚡ 빠른 시작 가이드

### 1. 웹 에디터 실행
1. 웹 브라우저(Chrome, Edge 등)로 `index.html` 파일을 더블 클릭하여 실행합니다. (CORS 에러를 피하기 위해 표준 스크립트로 동작하므로 로컬 웹서버가 필요 없습니다.)
2. 좌측 드롭존을 통해 편집할 영상/음원을 가져와 타임라인(Track 1~4)에 적절히 드래그 배치합니다.
3. 영상 클립을 클릭하고 우측 속성 제어판에서 **'로컬 전체 경로'**가 내 컴퓨터 내 실제 절대 경로(예: `D:\Study\WebPage\sVidEditor\source\video1.mp4`)로 지정되었는지 확인합니다.
4. 자막 입력, 비디오 회전(Transpose), 필터 드래그(흑백, 세피아), 줌, PIP 배치 등을 수행합니다.

### 2. 로컬 렌더링 실행
1. 편집을 모두 마친 뒤 우측 상단의 **`렌더링 배치파일 내보내기`** 버튼을 누릅니다.
2. 다운로드된 `render.bat` 파일을 프로젝트 루트 폴더(`D:\Study\WebPage\sVidEditor`)에 넣습니다.
3. [ffmpeg/README.txt](ffmpeg/README.txt) 내용에 따라 `ffmpeg.exe`와 `ffprobe.exe`를 다운로드하여 `ffmpeg/` 폴더에 넣거나 시스템 PATH에 설치합니다.
4. `render.bat`을 더블 클릭해 실행하면, 로컬 PC에서 즉시 인코딩이 가동되며 최종 영상이 `output/` 폴더에 저장됩니다.

---

## 🌐 GitHub Pages 웹 배포 방법

프로젝트 원격 리모트(`git@github.com:tramper2/sVidEditor.git`)로 배포할 준비가 되어 있습니다.

*   **Windows 환경**: 최상위 폴더에 위치한 **`deploy.bat`** 파일을 더블 클릭하면 자동으로 변경 코드가 커밋되고 `gh-pages` 브랜치로 배포가 완료됩니다.
*   **Bash 환경**: 터미널에서 `./deploy.sh` 스크립트를 기동합니다.

---

## 📄 라이선스 및 상세 문서
상세한 설치법 및 각 기능의 구현 기술 내역은 `Doc/walkthrough.md` 및 `Doc/implementation_plan.md` 파일을 참조해 주세요.
