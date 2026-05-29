@echo off
chcp 65001 > nul
echo =====================================================================
echo  GitHub Pages 자동 배포 스크립트를 실행합니다. (Windows 용)
echo =====================================================================
echo.

:: Git 설치 여부 확인
where git >nul 2>nul
if %errorlevel% neq 0 (
    echo [오류] Git이 설치되어 있지 않거나 환경변수 PATH에 등록되지 않았습니다.
    pause
    exit /b 1
)

:: 현재 활성화된 브랜치 이름 확인
for /f "tokens=*" %%i in ('git branch --show-current') do set CURRENT_BRANCH=%%i
if "%CURRENT_BRANCH%"=="" set CURRENT_BRANCH=main

echo [진행] 현재 브랜치 '%CURRENT_BRANCH%'의 변경 사항을 커밋합니다...
git add .
git commit -m "Deploy to GitHub Pages (Auto-script)"

echo.
echo [진행] GitHub Pages 원격 브랜치(gh-pages)로 강제 푸시합니다...
git push -f git@github.com:tramper2/sVidEditor.git %CURRENT_BRANCH%:gh-pages

if %errorlevel% equ 0 (
    echo.
    echo =====================================================================
    echo [성공] 배포가 성공적으로 완료되었습니다!
    echo 저장소 주소: git@github.com:tramper2/sVidEditor.git
    echo 웹 페이지는 잠시 후 https://tramper2.github.io/sVidEditor/ 에서 확인하실 수 있습니다.
    echo =====================================================================
) else (
    echo.
    echo =====================================================================
    echo [오류] 배포 도중 문제가 발생했습니다. SSH 키 설정 또는 권한을 확인하세요.
    echo =====================================================================
)

pause
