import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { Activity, Server, Users, Ticket } from 'lucide-react';
import { useBooking } from '../BookingContext';
import { PageTitle, airportName } from '../components/BookingUI';
import { money } from '../utils/booking';
function AdminPage({ mode = 'dashboard' }) {
  const { flights, setFlights, bookings, setBookings } = useBooking();
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(null);
  const [price, setPrice] = useState('');
  const [confirm, setConfirm] = useState(null);
  const [saved, setSaved] = useState('');
  const [peak, setPeak] = useState(false);
  const visible = bookings.filter((item) =>
    `${item.id} ${item.contact.email} ${item.passengers.map((person) => person.name).join(' ')}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <div className="container flowPage">
      <div className="adminHeading">
        <PageTitle
          eyebrow="OPERATIONS / DEMO"
          title={
            {
              dashboard: '서비스 운영 현황',
              flights: '항공편·운임 관리',
              bookings: '예약 관리',
            }[mode]
          }
        />
        <Link
          className="secondary"
          to="/"
        >
          사용자 화면으로
        </Link>
      </div>
      <div className="notice">
        관리자 UI 체험 · 권한 검증 없는 데모입니다. 모든 운영 수치는 예시이며
        실제 인프라·AI·Redis와 연결되지 않았습니다.
      </div>
      <nav
        className="adminTabs"
        aria-label="관리자 메뉴"
      >
        <NavLink
          to="/admin"
          end
        >
          운영 대시보드
        </NavLink>
        <NavLink to="/admin/flights">항공편·좌석·운임</NavLink>
        <NavLink to="/admin/bookings">예약 관리</NavLink>
      </nav>
      {mode === 'dashboard' && (
        <>
          <div className="metricGrid">
            {[
              [Users, '현재 접속자', peak ? '2,480' : '840', '명'],
              [ClockIcon, '대기 인원', peak ? '320' : '24', '명'],
              [
                Ticket,
                '체험 예약',
                bookings.filter((item) => item.status === '예약 완료').length,
                '건',
              ],
              [Server, '가동 서버', peak ? '6' : '3', '대'],
            ].map(([Icon, label, value, unit]) => (
              <div
                className="metric"
                key={label}
              >
                <Icon size={20} />
                <span>{label}</span>
                <strong>
                  {value}
                  <small>{unit}</small>
                </strong>
                <small>
                  {label === '체험 예약'
                    ? '현재 세션 실제 생성 건수'
                    : '시뮬레이션 데이터'}
                </small>
              </div>
            ))}
          </div>
          <div className="dashboardGrid">
            <section className="whitePanel">
              <div className="listHeading">
                <h2>트래픽 예측 비교</h2>
                <button
                  className="secondary"
                  onClick={() => setPeak((prev) => !prev)}
                >
                  {peak ? '평시 보기' : '혼잡 상황 보기'}
                </button>
              </div>
              <p className="muted">
                최근 6시간 · 초록: 실제값 예시 / 회색: AI 예측값 예시
              </p>
              <div
                className="chart"
                role="img"
                aria-label="09시부터 14시까지 트래픽이 증가하는 예시 막대 그래프"
              >
                {[25, 38, 32, 55, 65, peak ? 95 : 72].map((height, i) => (
                  <div
                    className="chartColumn"
                    key={i}
                  >
                    <div className="bars">
                      <span
                        style={{ height: `${height}%` }}
                        title={`실제값 예시 ${height * 30}`}
                      />
                      <span
                        style={{ height: `${Math.min(100, height + 8)}%` }}
                        title={`예측값 예시 ${(height + 8) * 30}`}
                      />
                    </div>
                    <small>{9 + i}:00</small>
                  </div>
                ))}
              </div>
            </section>
            <section className="whitePanel">
              <h2>인프라 상태</h2>
              <div className="reviewRow">
                <span>오토스케일링</span>
                <span className="pill">
                  {peak ? '증설 시뮬레이션' : '정상 예시'}
                </span>
              </div>
              <div className="reviewRow">
                <span>좌석 동시성 제어</span>
                <span>Redis 연결 전</span>
              </div>
              <div className="reviewRow">
                <span>AI 예측 모델</span>
                <span>모델 연결 전</span>
              </div>
              <div className="reviewRow">
                <span>결제 서비스</span>
                <span>체험 모드</span>
              </div>
              <Link
                className="textLink"
                to="/queue"
              >
                사용자 대기 화면 체험 →
              </Link>
            </section>
          </div>
          <section className="whitePanel">
            <h2>운영 이벤트 예시</h2>
            <p className="muted">
              14:00 ·{' '}
              {peak
                ? '예상 트래픽 증가 → 서버 3대 증설 시나리오'
                : '트래픽 안정 → 서버 3대 유지 시나리오'}
            </p>
            <p className="muted">
              13:50 · 대기열 및 예약 서비스 상태 점검 예시
            </p>
          </section>
        </>
      )}
      {mode === 'flights' && (
        <section className="whitePanel">
          <h2>예시 항공편 목록</h2>
          <p className="muted">
            운임과 판매 상태 변경은 현재 세션의 검색 결과에 반영됩니다.
            날짜·노선별 실재 재고가 아닌 공통 템플릿입니다.
          </p>
          {saved && (
            <p
              role="status"
              className="notice"
            >
              {saved}
            </p>
          )}
          <div className="tableScroll">
            <table>
              <thead>
                <tr>
                  <th>항공편</th>
                  <th>출발 시간</th>
                  <th>일반석 기본 운임</th>
                  <th>좌석 현황</th>
                  <th>판매 상태</th>
                  <th>관리</th>
                </tr>
              </thead>
              <tbody>
                {flights.map((flight) => (
                  <tr key={flight.id}>
                    <td>
                      <strong>{flight.id}</strong>
                      <br />
                      {flight.airline}
                    </td>
                    <td>{flight.time}</td>
                    <td>{money(flight.price)}</td>
                    <td>48석 / 점유 예시 6석</td>
                    <td>{flight.available ? '판매 중' : '판매 중지'}</td>
                    <td>
                      <button
                        className="secondary"
                        onClick={() => {
                          setEditing(flight.id);
                          setPrice(String(flight.price));
                        }}
                      >
                        운임 수정
                      </button>
                      <button
                        className="textLink"
                        onClick={() => {
                          setFlights((prev) =>
                            prev.map((item) =>
                              item.id === flight.id
                                ? { ...item, available: !item.available }
                                : item,
                            ),
                          );
                          setSaved(`${flight.id} 판매 상태를 변경했습니다.`);
                        }}
                      >
                        {flight.available ? '판매 중지' : '판매 재개'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {editing && (
            <form
              className="inlineEditor"
              onSubmit={(event) => {
                event.preventDefault();
                setFlights((prev) =>
                  prev.map((item) =>
                    item.id === editing
                      ? { ...item, price: Number(price) }
                      : item,
                  ),
                );
                setSaved(`${editing} 운임을 저장했습니다.`);
                setEditing(null);
              }}
            >
              <label className="stackLabel">
                {editing} 일반석 기본 운임
                <input
                  type="number"
                  required
                  min={1000}
                  max={10000000}
                  step={1000}
                  value={price}
                  onChange={(event) => setPrice(event.target.value)}
                />
              </label>
              <button className="primary">저장</button>
              <button
                className="secondary"
                type="button"
                onClick={() => setEditing(null)}
              >
                취소
              </button>
            </form>
          )}
        </section>
      )}
      {mode === 'bookings' && (
        <section className="whitePanel">
          <label className="stackLabel">
            예약 검색
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="예약 번호, 탑승객 이름, 이메일"
            />
          </label>
          <div className="tableScroll">
            <table>
              <thead>
                <tr>
                  <th>예약 번호</th>
                  <th>여정</th>
                  <th>금액</th>
                  <th>상태</th>
                  <th>관리</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <Link
                        className="textLink"
                        to={`/bookings/${item.id}`}
                      >
                        {item.id}
                      </Link>
                    </td>
                    <td>
                      {airportName(item.search.from)} →{' '}
                      {airportName(item.search.to)}
                      <br />
                      {item.search.depart}
                    </td>
                    <td>{money(item.total)}</td>
                    <td>{item.status}</td>
                    <td>
                      {item.status === '예약 완료' && (
                        <button
                          className="secondary"
                          onClick={() => setConfirm(item.id)}
                        >
                          예약 취소
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!visible.length && (
            <p className="emptyPanel">
              검색된 예약이 없습니다. 사용자 화면에서 체험 예약을 먼저 만들어
              주세요.
            </p>
          )}
          {confirm && (
            <div className="notice">
              <p>{confirm} 예약을 취소할까요? 실제 환불은 발생하지 않습니다.</p>
              <div className="toolbar">
                <button
                  className="dangerButton"
                  onClick={() => {
                    setBookings((prev) =>
                      prev.map((item) =>
                        item.id === confirm
                          ? { ...item, status: '취소 완료' }
                          : item,
                      ),
                    );
                    setConfirm(null);
                  }}
                >
                  취소 확정
                </button>
                <button
                  className="secondary"
                  onClick={() => setConfirm(null)}
                >
                  닫기
                </button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
const ClockIcon = Activity;
export default AdminPage;
