# taobao_kor_extension

Taobao 웹사이트(`*.taobao.com`)의 중국어 UI 텍스트를 자동으로 한국어로 변환해 보여주는 Chrome Extension (Manifest V3)입니다.

## 기능

- Taobao 페이지 진입 시 텍스트 자동 번역
- 무한 스크롤/AJAX 등 동적 DOM 업데이트 감지 후 재번역
- 팝업에서 확장 기능 ON/OFF
- 옵션 페이지에서 번역 API 사용 여부 및 엔드포인트 설정
- 사용자 지정 번역 API URL 사용을 위해 외부 번역 엔드포인트(`http/https`) 접근 권한 포함
- 기본 내장 사전 + 번역 결과 캐시(`chrome.storage.local`)

## 설치 방법 (개발자 모드)

1. Chrome에서 `chrome://extensions` 이동
2. 우측 상단 `개발자 모드` 활성화
3. `압축해제된 확장 프로그램 로드` 클릭
4. 이 저장소 루트 폴더 선택

## 사용 방법

- 기본값은 내장 사전 기반 번역입니다.
- 더 넓은 번역 범위를 원하면 확장 `옵션`에서 `번역 API 사용`을 켜고 API URL/Key를 입력하세요.
- 팝업에서 자동 번역을 빠르게 ON/OFF 할 수 있습니다.

## 파일 구조

- `manifest.json`: 확장 매니페스트
- `src/content.js`: 페이지 내 텍스트 추출/치환, MutationObserver
- `src/background.js`: 설정 관리, 번역 처리, 캐시 관리
- `src/popup.*`: 빠른 토글 UI
- `src/options.*`: API/언어/캐시 옵션 UI
