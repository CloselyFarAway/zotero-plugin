# Zotero OneDrive Organizer

[English](README.md) | **한국어**

Zotero 10의 **My Library에 저장된 PDF**를 OneDrive 또는 다른 로컬/동기화 폴더로 옮기고, Zotero에서는 **linked-file attachment**로 계속 사용할 수 있게 해주는 플러그인입니다. Zotero Collection/Subcollection 구조도 실제 폴더 구조에 반영할 수 있습니다.

> 현재 버전: **v0.1.5**. 핵심 stored PDF → linked file 변환은 Zotero 10.0.4 / Windows에서 실제 동작을 확인했습니다. v0.1.5는 기존 파일을 업데이트만으로 건드리지 않으면서 metadata 기반 파일명, 기존 linked PDF 이름 수정, 선택적 영구삭제 연동을 추가합니다.

## 다운로드 및 설치

최신 `.xpi`는 **[GitHub Releases](https://github.com/CloselyFarAway/zotero-plugin/releases/latest)**에서 받습니다.

Zotero에서 **도구 → Plugins → 톱니바퀴/메뉴 → Install Plugin From File…**을 선택합니다.

## 가장 안전한 첫 사용 순서

1. **Settings → OneDrive Organizer**를 엽니다.
2. **Browse…**로 `D:\OneDrive\Zotero_PDF` 같은 전용 폴더를 지정합니다.
3. **Check folder**로 실제 쓰기 권한까지 확인합니다.
4. 처음에는 자동 정리를 OFF로 둡니다.
5. 테스트 논문 하나를 선택하고 **Preview selected path(s)…**를 누릅니다.
6. 경로가 맞으면 **Organize selected item(s)**를 실행합니다.
7. Zotero에서 PDF가 정상적으로 열리고 OneDrive에 파일이 존재하는지 확인합니다.
8. 성공한 뒤에만 자동 정리 또는 전체 migration을 사용합니다.

## 기본 저장 예시

```text
Zotero
My Library
└─ Ferroelectric
   └─ BaTiO3
      └─ 논문
         └─ PDF

OneDrive
D:\OneDrive\Zotero_PDF\
└─ My Library\
   └─ Ferroelectric\
      └─ BaTiO3\
         └─ Jung_2025_Design Principles and Identification of Birefringent Materials.pdf
```

## v0.1.5: 이상한 PDF 파일명 방지

출판사 PDF는 실제 브라우저 탭이나 다운로드 파일명이 다음처럼 들어오는 경우가 있습니다.

```text
cm5c00977_1.9.pdf
1234567.pdf
download.pdf
```

기본으로 켜져 있는 **Wait for bibliographic metadata before automatic organization** 옵션은 Zotero가 PDF에 정상적인 논문 metadata/parent item을 붙일 때까지 자동 이동을 보류합니다.

metadata가 준비되면 다음 기본 규칙으로 파일명을 만듭니다.

```text
{firstCreator}_{year}_{title}.pdf
```

metadata가 아직 없으면 잘못된 이름으로 OneDrive에 바로 옮기는 대신 PDF를 Zotero storage에 그대로 두고 나중에 다시 시도합니다.

## 이미 이상한 이름으로 저장된 PDF 수정

**Rename selected linked PDF(s)…**를 사용합니다.

- 현재 설정된 root 안의 linked PDF만 대상
- 정상적인 parent bibliographic metadata가 있어야 함
- 실행 전 `기존 경로 → 새 경로` 미리보기/확인
- Collection 폴더 위치는 바꾸지 않고 **파일명만 같은 폴더 안에서 변경**
- Zotero linked path도 동시에 업데이트
- Zotero DB 업데이트가 실패하면 파일명 변경을 원래대로 되돌리도록 시도

업데이트만 했다고 기존 파일명이 자동으로 바뀌지는 않습니다.

## v0.1.5: Zotero 영구삭제와 OneDrive PDF 삭제 연동

새 옵션:

**Delete external PDF when it is permanently deleted from Zotero**

기본값은 **OFF**입니다.

동작은 다음처럼 보수적으로 설계되어 있습니다.

```text
Zotero에서 Trash로 이동
→ OneDrive PDF 유지

Trash에서 Delete Permanently / Empty Trash
→ 옵션이 켜져 있고
→ PDF가 현재 설정된 root 안에 있을 때만
→ 외부 PDF 삭제
```

즉 v0.1.3/v0.1.4에서 만들어둔 기존 PDF가 v0.1.5 설치만으로 삭제되는 일은 없습니다.

## 기존 버전에서 업데이트할 때

v0.1.5는 기존 linked PDF를 자동 migration하지 않습니다.

- 기존 폴더 위치 유지
- 기존 파일명 유지
- `Rename selected linked PDF(s)…`를 직접 눌렀을 때만 파일명 변경
- 외부 PDF 영구삭제 연동은 직접 켜기 전까지 OFF
- metadata 대기 기능은 앞으로 자동 정리되는 stored PDF에 적용

따라서 기존 기능 위에 새 기능이 추가되는 방식이며, 기존 정리 결과를 자동으로 덮어쓰지 않습니다.

## 주요 기능

- Zotero 10.0.x 지원
- OneDrive/Dropbox/NAS/외장 SSD 등 일반 로컬 폴더 사용
- Collection/Subcollection 폴더 구조 반영
- 선택 논문만 안전하게 처리
- 이동 전 목적 경로 Preview
- 전체 migration 전 개수/확인 절차
- 파일명 template
- Windows 금지 문자 정리 및 중복명 `(2)`, `(3)` 처리
- relative linked-file path 옵션
- 대상 폴더 실제 쓰기 권한 검사
- metadata 준비 후 자동 이름 생성
- 기존 linked PDF 이름 수동 정리
- 선택적 영구삭제 연동

## stored → linked 안전 처리

```text
Zotero stored PDF
      ↓
외부 폴더로 먼저 복사
      ↓
파일 크기 검증
      ↓
linked attachment 생성
      ↓
annotation / relation / full-text 정보 이전
      ↓
마지막 단계에서 기존 stored attachment 삭제
```

중간에 실패하면 기존 stored attachment를 유지하고, 새 외부 복사본은 가능한 경우 제거합니다.

## 중요한 제한

- **My Library만 지원:** Zotero 자체가 Group Library에서 linked-file attachment를 지원하지 않습니다.
- linked PDF는 Zotero Storage에 업로드되지 않으므로 Zotero 모바일/웹에서 Zotero File Storage 방식으로 받을 수 없습니다.
- 현재 PDF만 지원합니다.
- 이미 정리된 논문을 다른 Collection으로 옮겨도 실제 linked PDF 폴더는 아직 자동 이동되지 않습니다.
- OneDrive는 일반 로컬 경로로 mount/sync되어 있어야 합니다. Microsoft Graph API를 사용하지 않습니다.
- Zotero의 `zotero.sqlite` 또는 전체 Data Directory를 OneDrive에 넣지 마세요.

## 개인정보/네트워크

- 텔레메트리 없음
- Microsoft Graph/OneDrive API 사용 안 함
- PDF 처리는 로컬 filesystem에서 수행
- 업데이트 확인을 위해 Zotero가 저장소의 `updates.json`을 읽을 수 있음

이 프로젝트는 Zotero/Microsoft의 공식 프로젝트가 아닙니다.

## 버그 제보

설정 화면의 **Report a bug / request a feature** 또는 GitHub Issues를 사용해주세요.

가능하면 다음을 포함해주세요.

- Zotero 버전
- 플러그인 버전
- 운영체제
- 재현 순서
- 오류 메시지 / Zotero Debug Output

## License

MIT License — [LICENSE](LICENSE)
