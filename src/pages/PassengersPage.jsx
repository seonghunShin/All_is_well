import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useBooking } from '../BookingContext';
import { BookingSteps, PageTitle, TripSummary } from '../components/BookingUI';
import { isDomesticRoute } from '../data/destinations';
import { validPassengers } from '../utils/booking';
import { dateAfter } from '../utils/search';
function PassengersPage() {
  const { draft, setDraft } = useBooking();
  const navigate = useNavigate();
  const [people, setPeople] = useState(
    draft.passengers ||
      Array.from({ length: Number(draft.search.passengers) }, () => ({
        name: '',
        birth: '',
        passport: '',
      })),
  );
  const [email, setEmail] = useState(draft.contact?.email || '');
  const [phone, setPhone] = useState(draft.contact?.phone || '');
  const [error, setError] = useState('');
  const international =
    !isDomesticRoute(draft.search) ||
    [draft.outbound, draft.inbound].some(
      (flight) => flight?.segments?.length && !isDomesticRoute(flight),
    );
  function update(index, field, value) {
    setPeople((prev) =>
      prev.map((person, i) =>
        i === index ? { ...person, [field]: value } : person,
      ),
    );
  }
  function submit(event) {
    event.preventDefault();
    if (!validPassengers(people, international)) {
      setError(
        '이름은 2자 이상, 생년월일은 올바른 날짜로 입력해 주세요. 국제선 여권 번호는 영문·숫자 6~12자입니다.',
      );
      return;
    }
    setDraft((prev) => ({
      ...prev,
      passengers: people,
      contact: { email, phone },
    }));
    navigate('/seats');
  }
  return (
    <div className="container flowPage">
      <BookingSteps current={1} />
      <PageTitle title="함께 떠나는 분을 알려주세요.">
        체험용 이름과 연락처를 입력해 주세요. 실제 개인정보는 필요하지 않아요.
      </PageTitle>
      <div className="checkoutGrid">
        <form
          onSubmit={submit}
          className="formStack"
        >
          {people.map((person, index) => (
            <section
              className="whitePanel"
              key={index}
            >
              <h2>
                탑승객 {index + 1} <span className="pill">성인</span>
              </h2>
              <div className="inputGrid">
                <label className="stackLabel">
                  {international ? '영문 이름' : '이름'}
                  <input
                    required
                    minLength={2}
                    maxLength={60}
                    value={person.name}
                    onChange={(event) =>
                      update(index, 'name', event.target.value)
                    }
                    placeholder={international ? 'HONG GILDONG' : '홍길동'}
                  />
                </label>
                <label className="stackLabel">
                  생년월일
                  <input
                    required
                    type="date"
                    min="1900-01-01"
                    max={dateAfter()}
                    value={person.birth}
                    onChange={(event) =>
                      update(index, 'birth', event.target.value)
                    }
                  />
                </label>
                {international && (
                  <label className="stackLabel">
                    여권 번호 (체험용)
                    <input
                      required
                      pattern="[A-Za-z0-9]{6,12}"
                      value={person.passport}
                      onChange={(event) =>
                        update(index, 'passport', event.target.value)
                      }
                      placeholder="M12345678"
                    />
                  </label>
                )}
              </div>
            </section>
          ))}
          <section className="whitePanel">
            <h2>예약 연락처</h2>
            <div className="inputGrid">
              <label className="stackLabel">
                이메일
                <input
                  required
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="demo@example.com"
                />
              </label>
              <label className="stackLabel">
                휴대전화
                <input
                  required
                  type="tel"
                  pattern="[0-9\-+ ]{9,15}"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="010-0000-0000"
                />
              </label>
            </div>
            <p className="muted">
              입력 내용은 현재 실행 중인 화면 메모리에만 유지되며 새로고침하면
              사라집니다.
            </p>
          </section>
          {error && (
            <p
              role="alert"
              className="formError"
            >
              {error}
            </p>
          )}
          <div className="pageActions">
            <Link
              className="secondary"
              to="/flights"
            >
              이전
            </Link>
            <button className="primary">다음 · 좌석 선택</button>
          </div>
        </form>
        <TripSummary />
      </div>
    </div>
  );
}
export default PassengersPage;
