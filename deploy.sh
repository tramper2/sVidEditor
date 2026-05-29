#!/bin/bash
# =====================================================================
# sVidEditor - GitHub Pages 배포 자동화 스크립트 (Bash 용)
# =====================================================================

echo "=== GitHub Pages 배포 시작 ==="

# Git 설치 및 원격 점검
if ! command -v git &> /dev/null; then
    echo "[오류] Git이 설치되어 있지 않거나 환경변수 PATH에 존재하지 않습니다."
    exit 1
fi

# 현재 브랜치 획득
CURRENT_BRANCH=$(git branch --show-current)
if [ -z "$CURRENT_BRANCH" ]; then
    CURRENT_BRANCH="main"
fi

echo "현재 브랜치: $CURRENT_BRANCH"
echo "변경 사항 저장 중..."

git add .
git commit -m "Deploy to GitHub Pages (Auto-script)"

echo "GitHub Pages 원격 저장소로 강제 푸시 중..."
git push -f git@github.com:tramper2/sVidEditor.git "$CURRENT_BRANCH:gh-pages"

if [ $? -eq 0 ]; then
    echo "====================================================================="
    echo "[성공] 배포 완료!"
    echo "잠시 후 https://tramper2.github.io/sVidEditor/ 에서 확인 가능합니다."
    echo "====================================================================="
else
    echo "====================================================================="
    echo "[오류] 푸시 실패. SSH 권한 및 네트워크 연결 상태를 확인하세요."
    echo "====================================================================="
fi
