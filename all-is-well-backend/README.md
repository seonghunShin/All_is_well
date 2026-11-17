# All is well 예약 백엔드

Java 17과 Spring Boot 3.5로 구현한 캡스톤 프로젝트의 로컬 백엔드입니다. 바로 옆 `all-is-well-frontend`는 팀원 React 화면을 바탕으로 회원가입, 로그인, 대기열, 가상 좌석 선점, 모의 결제, 예약 내역, 취소를 Spring Boot에 연결한 버전입니다.

## 팀원 React와 실행

백엔드 폴더의 PowerShell에서 다음 명령을 실행합니다. 실제 항공편을 검색할 때 첫 두 줄로 본인의 Ignav 키를 입력합니다. 가상 항공편 검색과 모의 예약은 세 번째 줄만 실행해도 체험할 수 있습니다.

```powershell
$key = Read-Host 'Ignav API 키' -AsSecureString
$env:IGNAV_API_KEY = [System.Net.NetworkCredential]::new('', $key).Password
.\mvnw.cmd spring-boot:run
```

옆의 `all-is-well-frontend` 폴더에서 별도 터미널을 열어 아래 명령을 실행합니다. `npm.cmd ci`는 처음 한 번 실행합니다.

```powershell
npm.cmd ci
npm.cmd run dev
```

Vite가 표시한 주소를 브라우저에서 엽니다. 로그인 세션 쿠키를 계속 사용하려면 같은 주소로 접속합니다. `GET http://127.0.0.1:4000/api/health`로 Spring Boot의 응답을 확인할 수 있습니다. 연동판은 [팀원 React의 3c474ee 버전](https://github.com/sanaluca256/all-is-well-test-/tree/3c474ee6b68c181e56d887ada658a7035b15aaf8)을 바탕으로 합니다.

| 화면 또는 실습 | 처리 방식 |
|---|---|
| 항공편 검색 | React → `POST /api/flights/search` → Ignav 편도 검색. 같은 검색 조건의 결과를 캐시합니다. |
| 판매처 링크 조회 | React → `POST /api/flights/booking-links` → Ignav 링크 조회. |
| 가상 항공편 검색 | `POST /api/flights/virtual`에서 연습용 항공편과 인원 기준 운임을 계산합니다. |
| 회원가입·로그인 | `/api/auth/signup`, `/api/auth/login`, `/api/auth/me`, `/api/auth/logout`과 서버 세션 사용. |
| 좌석 선택·모의 예약 | 입장 순번과 서버의 좌석 상태를 표시하고, 선점 이후 모의 결제 금액을 확인합니다. |
| 내 예약과 취소 | 로그인 계정의 예약을 조회합니다. 출발 전 취소 시 서버에서 좌석을 해제합니다. |

## 계정 기반 예약

화면에서 회원가입 → 항공편 검색 → 좌석 선택 → 좌석 선점 → 모의 결제 → 내 예약 또는 취소로 진행합니다. 실제 조회 운임을 사용한 경우에도 좌석과 결제는 연습용입니다. 판매처 링크로 외부 구매 화면을 열 수 있습니다.

| 요청 | 동작 |
|---|---|
| `POST /api/bookings/queue` | 로그인 계정의 입장을 요청하고 `token`과 대기 상태를 반환합니다. |
| `GET /api/bookings/queue` | 대기 순번이나 입장 여부를 조회합니다. |
| `DELETE /api/bookings/queue` | 해당 계정의 대기·입장을 종료하고 선점 중인 좌석을 돌려놓습니다. |
| `GET /api/bookings/availability?offerId=…` | 선택 불가 좌석과 좌석별 추가 금액을 조회합니다. |
| `POST /api/bookings/holds` | 서버가 발행한 `offerId`와 선택한 `seats`로 좌석을 선점하고 모의 결제 금액을 계산합니다. |
| `DELETE /api/bookings/holds/{holdId}` | 해당 계정의 좌석 선점을 해제합니다. |
| `POST /api/bookings/holds/{holdId}/confirm` | 모의 결제로 예약을 확정합니다. 재시도 시 같은 예약을 반환합니다. |
| `GET /api/bookings` | 로그인 계정의 예약 내역을 조회합니다. |
| `POST /api/bookings/{code}/cancel` | 로그인 계정의 예약을 취소합니다. |

대기열 조회부터 예약 확정까지는 `X-Queue-Token`도 함께 보냅니다. 로그인 계정과 예약 내역은 기본 로컬 H2 파일 `data/all-is-well.mv.db`에 저장되므로 서버를 다시 실행한 뒤에도 로그인하면 조회할 수 있습니다. 이전 React의 브라우저 체험 데이터와 별개로 연동판에서 회원가입하고 사용합니다.

## 서버 예약 API 실습

백엔드가 실행 중일 때 백엔드 폴더의 다른 PowerShell에서 `./scripts/demo-reservation.ps1`을 실행하면 별도의 테스트 대기열에서 가상 좌석 `13A` 선점, 모의 결제 후 예약 확정, 중복 확정 요청의 응답까지 확인할 수 있습니다.

대기열 입장 요청으로 받은 토큰을 다음 요청의 `X-Queue-Token` 헤더에 넣습니다. `flightKey`는 실습용 항공편 식별자입니다.

| 요청 | 동작 |
|---|---|
| `POST /api/reservations/queue` | 세션을 등록하고 입장 상태나 대기 순번을 반환합니다. |
| `GET /api/reservations/queue` | 입장 상태, 대기 순번 및 유효시간을 조회합니다. |
| `POST /api/reservations/holds` | `{"flightKey":"GMP-CJU-DEMO","seats":["13A"]}`로 가상 좌석을 선점합니다. |
| `DELETE /api/reservations/holds/{holdId}` | 해당 세션의 가상 좌석 선점을 해제합니다. |
| `POST /api/reservations/holds/{holdId}/confirm` | 모의 결제가 성공한 예약을 확정합니다. 같은 토큰으로 재시도하면 유효기간 내에는 같은 예약 결과를 반환합니다. |

기본 설정은 동시 입장 3명, 선점 2분, 세션당 분당 요청 60회입니다. 로컬 Redis가 실행 중이면 아래 설정으로 대기열·좌석·예약 상태를 Redis에서 원자적으로 갱신합니다. 회원 계정은 H2를 사용합니다. 실습용 메모리 저장소는 `BOOKING_STORE=memory`로 선택합니다.

```powershell
$env:BOOKING_STORE = 'redis'
$env:REDIS_HOST = '127.0.0.1'
$env:REDIS_PORT = '6379'
.\mvnw.cmd spring-boot:run
```

같은 Redis를 공유하는 여러 실습 환경에는 서로 다른 `BOOKING_REDIS_KEY`를 지정합니다. 서버 로그는 기본값 `logs/reservation-events.jsonl`에 저장되며 `BOOKING_LOG_FILE`로 위치를 지정할 수 있습니다. 로그는 시각, 가명 세션 ID, 요청 종류, 처리 결과로 구성합니다.

## Isolation Forest 실험

Python 3.11 이상에서 아래 명령을 실행합니다.

```powershell
python -m pip install -r experiment/requirements.txt
python experiment/isolation_forest.py --demo
```

실제 실습 로그로 분석할 때는 정상 학습, 정상 기준 조정, 평가를 별도 세션으로 수집합니다. 라벨 CSV의 열은 `sessionId,label`이고 값은 `normal` 또는 `abuse`입니다.

```powershell
python experiment/isolation_forest.py --train logs/train.jsonl --calibrate logs/calibration.jsonl --evaluate logs/evaluation.jsonl --labels logs/labels.csv --scores logs/scores.jsonl
```

분석 스크립트는 로그를 입력받아 이상 점수를 기록하고, 평가 라벨에 대해 기본 규칙과 AI 판정의 탐지율·오탐률을 비교합니다. `--demo`는 합성 데이터 예시입니다. 기본 좌석 선점 만료를 관찰하는 실험에서는 `--window-seconds 240`으로 범위를 늘리고 만료 후 예약 API를 호출해 만료 이벤트를 기록합니다. 모의 예약 성공률과 대기시간은 실제 부하 실험에서 측정할 항목입니다.

## 검증 및 참고

`./mvnw.cmd test`로 서버 테스트를 실행합니다. Java와 Maven 구성은 수업 코드의 구성을 따랐고, 대기열과 좌석 선점의 원자적 상태 처리는 flash-sale의 Redis 구현을 참고했습니다.

- [Spring Boot 수업 코드](https://github.com/seonghunShin/web2_koreait_springboot)
- [Spring Boot 심화 수업 코드](https://github.com/seonghunShin/web2_koreait_springboot_adv)
- [flash-sale 대기열·선점 예제](https://github.com/seonghunShin/flash-sale/tree/85d5c99/flashsale)
