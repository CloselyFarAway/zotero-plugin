# Zotero OneDrive Organizer

[English](README.md) | **한국어**

Zotero 10의 **My Library에 저장된 PDF**를 OneDrive 또는 다른 로컬/동기화 폴더로 옮기고, Zotero 안에서는 해당 PDF를 **linked-file attachment**로 계속 사용할 수 있게 해주는 플러그인입니다. Zotero의 Collection/Subcollection 구조도 실제 폴더 구조에 반영할 수 있습니다.

> 현재 버전: **v0.1.8**. **v0.1.5에서 실험적으로 추가했던 metadata 대기/rename/삭제 동기화 기능은 회귀 문제 때문에 계속 제외되어 있습니다.** v0.1.8은 v0.1.6의 collection 배정 재시도와 v0.1.7의 `noOverwrite`/SHA-256/경로 길이/capability hardening을 유지하면서, linked attachment 변환을 먼저 DB에 commit한 뒤 기존 stored attachment를 별도 transaction에서 정리하도록 바꿨습니다. 기존 파일 정리에 실패해도 검증된 외부 PDF를 지우지 않으며, bulk migration은 PDF 사이에서 안전하게 취소할 수 있습니다. 처음 대량 이동하기 전에는 Zotero 데이터와 중요한 PDF를 백업하는 것을 권장합니다.

## 다운로드 및 설치

최신 `.xpi`는 **[GitHub Releases](https://github.com/CloselyFarAway/zotero-plugin/releases/latest)**에서 받습니다.

Zotero에서 **도구 → Plugins → 톱니바퀴/메뉴 → Install Plugin From File…**을 선택한 뒤 `.xpi`를 설치합니다.

## 가장 안전한 첫 사용 순서

1. **Settings → OneDrive Organizer**를 엽니다.
2. **Browse…**로 `D:\OneDrive\Zotero_PDF` 같은 전용 폴더를 지정합니다.
3. **Check folder**를 눌러 실제 쓰기 권한까지 확인합니다.
4. 처음에는 자동 정리를 켜지 않습니다.
5. 테스트 논문 하나를 선택하고 **Preview selected path(s)…**를 눌러 예상 저장 위치를 확인합니다. 이 단계에서는 파일이 이동하지 않습니다.
6. 경로가 맞으면 **Organize selected item(s)**를 실행합니다.
7. Zotero에서 PDF가 정상적으로 열리고 OneDrive에 파일이 생겼는지 확인합니다.
8. 성공한 뒤에만 자동 정리 또는 **Organize ALL existing PDFs…**를 사용합니다.


## 기본 저장 예시

Zotero:

```text
My Library
└─ Ferroelectric
   └─ BaTiO3
      └─ 논문
         └─ PDF
```

OneDrive root:

```text
D:\OneDrive\Zotero_PDF
```

결과:

```text
D:\OneDrive\Zotero_PDF\
└─ My Library\
   └─ Ferroelectric\
      └─ BaTiO3\
         └─ Yeo_2026_논문제목.pdf
```

## 주요 기능

- Zotero 10.0.x 지원
- OneDrive뿐 아니라 Dropbox/NAS/외장 SSD 등 일반 로컬 폴더 사용 가능
- 새 stored PDF 자동 정리 기능(기본 OFF)
- 선택한 논문만 안전하게 처리
- 실제 이동 전 목적 경로 미리보기
- 기존 PDF 전체 정리 전 개수 표시 + 확인 절차
- Collection/Subcollection 폴더 구조 반영
- 연도 폴더 선택 가능
- 파일명 템플릿 지정
- Windows에서 사용할 수 없는 파일명 문자 자동 정리
- 같은 파일명이 있을 때 `(2)`, `(3)`처럼 자동 회피하며 기존 파일을 덮어쓰지 않음
- 여러 PC에서 사용할 수 있는 Zotero relative linked-file path 옵션
- 대상 폴더의 실제 쓰기 권한 검사
- stored 원본 삭제 전 source/destination SHA-256 일치 확인
- Windows에서 전체 destination path가 너무 길면 생성 파일명만 줄이고 collection 폴더 구조는 임의로 바꾸지 않음
- 필수 Zotero/Firefox API가 없으면 자동 정리를 등록하지 않고 파일 이동을 차단하는 capability check

## 안전하게 처리하는 방식

```text
Zotero stored PDF
      ↓
외부 폴더로 no-overwrite 방식으로 먼저 복사
      ↓
파일 크기 + SHA-256 검증
      ↓
linked attachment 생성
      ↓
annotation / relation / full-text / note link 정보 이전
      ↓
마지막 단계에서 기존 stored attachment 삭제
```

복사 또는 Zotero DB 변경 과정에서 실패하면 기존 stored attachment를 유지하고 새 외부 복사본은 가능한 경우 삭제합니다.

## 중요한 제한

- **My Library만 지원:** Zotero 자체가 Group Library에서 linked-file attachment를 지원하지 않습니다.
- **모바일:** linked PDF 자체는 Zotero Storage로 올라가지 않으므로 Zotero 모바일/웹에서 Zotero 파일 동기화로 내려받을 수 없습니다.
- **현재 PDF만 지원:** EPUB, snapshot, image 등은 건너뜁니다.
- 이미 정리된 논문을 나중에 다른 Collection으로 옮겨도 실제 linked PDF 위치가 자동으로 다시 이동되지는 않습니다.
- OneDrive가 Windows/macOS/Linux에서 **일반 로컬 경로로 보이는 상태**여야 합니다. Microsoft Graph API를 사용하지 않습니다.
- Zotero의 `zotero.sqlite`나 전체 Data Directory 자체를 OneDrive에 넣으면 안 됩니다.

## 여러 컴퓨터에서 사용

예를 들어 같은 OneDrive가 컴퓨터마다 다른 위치라면:

```text
PC 1: D:\OneDrive\Zotero_PDF
PC 2: C:\Users\name\OneDrive\Zotero_PDF
```

**Use Zotero relative linked-file paths when safe** 옵션을 사용할 수 있습니다. 기존 Zotero base attachment path와 충돌하는 경우에는 안전을 위해 절대경로를 사용합니다.

## 제거하면 어떻게 되나?

플러그인을 제거해도 이미 변환된 PDF는 일반 Zotero linked attachment로 남습니다. 다만 이후 새 PDF의 자동 정리가 중단됩니다. 기존 linked PDF를 Zotero Storage로 자동 복구하지는 않습니다.

## 개인정보 및 네트워크

- 텔레메트리/분석 기능 없음
- Microsoft Graph/OneDrive API 사용 안 함
- PDF 처리는 로컬 파일시스템에서 수행
- 플러그인 업데이트 확인을 위해 Zotero가 이 저장소의 `updates.json`을 확인할 수 있음

이 프로젝트는 Zotero 또는 Microsoft의 공식 프로젝트가 아닙니다.

## 버그 제보

설정 화면의 **Report a bug / request a feature** 버튼을 사용하거나 GitHub Issues에 남겨주세요. 아래 정보가 있으면 문제를 재현하기 쉽습니다.

- Zotero 버전
- 플러그인 버전
- 운영체제
- 문제 재현 순서
- 가능하면 Zotero Debug Output / 오류 메시지

## License

MIT License입니다. 자세한 내용은 [LICENSE](LICENSE)를 참고하세요.
