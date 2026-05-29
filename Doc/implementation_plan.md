# Implementation Plan - Local FFmpeg Video Editor (sVidEditor)

로컬에서 동작하는 고기능의 웹 기반 동영상 편집기(sVidEditor)를 구축하는 계획입니다. 브라우저에서 편집 결과를 실시간으로 프리뷰하고, 최종 렌더링은 로컬 컴퓨터의 `ffmpeg` 실행 파일로 처리할 수 있는 Windows 배치 파일(`render.bat`) 및 프로젝트 저장용 JSON 파라미터 파일을 생성해 줍니다.

## User Review Required

> [!IMPORTANT]
> **작업 디렉터리**: 모든 소스 코드는 `D:\Study\WebPage\sVidEditor` 폴더에 작성됩니다.
> **Git 원격 저장소**: 배포를 위한 Git 원격 주소는 `git@github.com:tramper2/sVidEditor.git`로 설정하고 `gh-pages` 브랜치에 배포될 수 있도록 준비합니다.
> **FFmpeg 실행 파일**: 렌더링 배치 파일은 `D:\Study\WebPage\sVidEditor\ffmpeg\ffmpeg.exe` 또는 Windows의 환경 변수(PATH)에 등록된 ffmpeg를 이용합니다. 하위 폴더에 넣을 수 있도록 준비합니다.

## Proposed System Architecture

웹 에디터 동작 방식의 아키텍처 다이어그램:

```mermaid
graph TD
    A[Web Editor index.html] -->|1. 미디어 가져오기| B[Browser Preview Engine]
    A -->|2. 타임라인 편집 (컷, PIP, 효과)| B
    B -->|스크러빙 & 재생 프리뷰| C[HTML5 Canvas + Web Audio]
    A -->|3. 스크립트 내보내기| D[render.bat 및 project.json 생성]
    D -->|4. render.bat 실행| E[로컬 Windows FFmpeg 렌더링]
    E -->|소스 파일 로드| F[최종 인코딩된 비디오 출력]
```

## Proposed Files and Directories

`D:\Study\WebPage\sVidEditor` 디렉터리에 다음 파일들을 생성합니다:

### 1. [index.html](file:///D:/Study/WebPage/sVidEditor/index.html)
* 싱글 페이지 애플리케이션(SPA)의 HTML 구조:
  * **상단 메뉴바**: 프로젝트 컨트롤 (새 프로젝트, 프로젝트 불러오기, 프로젝트 저장, FFmpeg 스크립트/배치 파일 내보내기, 배포 안내).
  * **좌측 패널**: 미디어 라이브러리(비디오/오디오/이미지 등록), 드래그 앤 드롭 가능한 비디오 효과 라이브러리(리버스, 세피아, 흑백 등).
  * **중앙 프리뷰 패널**: `<canvas>` 기반 실시간 재생 화면 (재생, 일시정지, 프레임 이동, 현재 재생 시간 표시).
  * **우측 속성 패널**: 선택된 클립의 정밀한 세부 조정 (볼륨, 회전, 줌인/아웃 비율, 자막 텍스트 내용, 오버레이 크기 및 위치 조정).
  * **하단 타임라인**: 
    * 비디오 트랙 1 (순차 결합용 메인 트랙)
    * 비디오 트랙 2 (오버레이 및 PIP 전용 트랙)
    * 배경 오디오 트랙 (BGM 배경음악 전용)
    * 오버레이 트랙 (자막 텍스트 및 PNG 이미지 배치용)
    * 타임라인 재생 헤드, 시간 표시 눈금자, 줌인/아웃 슬라이더.

### 2. [style.css](file:///D:/Study/WebPage/sVidEditor/style.css)
* Google Font `Outfit`을 사용하는 모던 다크 테마 스타일시트.
* 글래스모피즘(Glassmorphism) 스타일의 카드 레이아웃 및 타임라인 요소 디자인.
* 재생헤드 애니메이션 및 툴팁 효과용 CSS 스타일.

### 3. [app.js](file:///D:/Study/WebPage/sVidEditor/app.js)
* 프론트엔드 핵심 제어 로직:
  * **상태 관리(State Management)**: 임포트된 미디어 리소스 정보, 타임라인 배치 클립, 재생 시간 및 줌 수준 관리.
  * **실시간 캔버스 렌더러**: 현재 재생헤드 위치의 비디오 프레임 추출, 회전/흑백/세피아 CSS 필터 적용, 자막 및 PNG 이미지 오버레이 합성 프리뷰 제공.
  * **타임라인 조작**: 드래그 앤 드롭을 통한 클립 이동, 클립 양쪽 끝 드래그를 통한 트리밍(Trimming), 분할(Split) 기능 구현.

### 4. [ffmpeg-generator.js](file:///D:/Study/WebPage/sVidEditor/ffmpeg-generator.js)
* 타임라인 설정을 Windows FFmpeg 명령어로 변환하는 핵심 컴파일러:
  * 프레임 수(30, 60, 120, 180 fps) 및 코덱이 다른 다양한 원본 영상을 처리하기 위해, 개별 입력에 대해 프레임 속도와 크기를 표준화(`scale=1280:720,setsar=1,fps=60`)하여 결합합니다.
  * 개별 비디오 필터 구성:
    * 회전: `transpose=1` (우측 90도), `transpose=2` (좌측 90도), `transpose=1,transpose=1` (180도)
    * 흑백: `hue=s=0`
    * 세피아: `colorchannelmixer` 필터 적용
    * 줌인/아웃: `scale`과 `crop` 필터를 이용한 줌 효과 적용
    * 리버스: `reverse` 및 `areverse` 필터 적용
  * PIP 오버레이: 메인 비디오 트랙 위에 서브 트랙 비디오를 `overlay=x=X:y=Y:enable='between(t,S,E)'` 방식으로 합성.
  * 텍스트 자막: Windows 시스템 폰트(`arial.ttf`)를 사용하는 `drawtext` 필터 추가.
  * 오디오 믹싱: 배경 음악(`adelay`로 시간 지연)과 비디오 볼륨 조절(`volume`)을 `amix` 필터로 통합.
  * 전체 명세가 포함된 윈도우 배치 파일(`render.bat`) 생성 및 저장 기능 제공.

### 5. [ffmpeg/README.txt](file:///D:/Study/WebPage/sVidEditor/ffmpeg/README.txt)
* 로컬에 `ffmpeg.exe`와 `ffprobe.exe`를 어떻게 배치해야 하는지에 대한 설명서 작성.

### 6. [deploy.sh](file:///D:/Study/WebPage/sVidEditor/deploy.sh)
* 이 프로젝트를 자동으로 빌드 및 커밋하여 `git@github.com:tramper2/sVidEditor.git`의 `gh-pages` 브랜치에 배포하는 자동화 셸 스크립트.

## Verification Plan

### 수동 검증 단계 (로컬 실행)
1. `D:\Study\WebPage\sVidEditor\index.html` 파일을 웹 브라우저에서 실행합니다.
2. 다양한 프레임레이트와 크기를 가진 로컬 비디오 파일을 미디어 라이브러리에 로드합니다.
3. 타임라인에 비디오 클립을 드래그해 배치하고 재생/정지 및 재생 헤드 이동을 확인합니다.
4. 클립 나누기(Split), 볼륨 변경, 좌우 회전을 속성 탭에서 설정해 봅니다.
5. 리버스 효과 또는 흑백/세피아 필터를 드래그해서 배치해 봅니다.
6. PIP 효과를 위해 Video Track 2에 작은 크기로 비디오 클립을 얹어 봅니다.
7. PNG 오버레이 및 자막 텍스트를 배치합니다.
8. 프로젝트 파라미터 저장(`project.json`) 및 로컬 렌더링용 Windows 배치 파일(`render.bat`) 내보내기를 수행합니다.
9. 로컬 `ffmpeg`를 사용해 `render.bat`을 실행하고 렌더링된 최종 영상이 브라우저 프리뷰와 일치하는지 확인합니다.
