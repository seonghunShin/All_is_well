import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBooking } from '../BookingContext';
import {
  ArrowRight,
  ArrowUpRight,
  Compass,
  HeartHandshake,
  MousePointer2,
  ShieldCheck,
  Plane,
} from 'lucide-react';
import FlightSearch from '../components/FlightSearch';

import { destinations } from '../data/destinations';
import { dateAfter } from '../utils/search';

const defaultDeparture = 'GMP';

function HomePage() {
  const { draft, setDraft } = useBooking();
  const [values, setValues] = useState(() => ({
    trip: 'round',
    from: defaultDeparture,
    to: 'CJU',
    depart: dateAfter(7),
    returnDate: dateAfter(10),
    passengers: 1,
    cabin: '일반석',
    direct: false,
    ...(draft?.search || {}),
  }));
  const navigate = useNavigate();
  function handleSubmit(nextSearch) {
    setDraft({ search: nextSearch, outbound: null, inbound: null });
    navigate('/flights');
  }
  function handleDestination(code) {
    setValues((prev) => ({
      ...prev,
      to: code,
      from: prev.from === code ? defaultDeparture : prev.from,
    }));
    document
      .getElementById('search')
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    document.querySelector('[name="to"]')?.focus({ preventScroll: true });
  }
  return (
    <>
      <section className="hero">
        <div
          className="heroLandscape"
          aria-hidden="true"
        >
          <div className="sun" />
          <div className="mountain mountainBack" />
          <div className="mountain mountainFront" />
          <div className="flightPath" />
          <Plane
            className="heroPlane"
            size={49}
          />
        </div>
        <div className="container heroContent">
          <div className="heroBadge">
            <span /> A GOOD JOURNEY STARTS HERE
          </div>
          <h1>
            여행의 시작은,
            <br />
            <span>마음 편하게.</span>
          </h1>
          <p className="heroDescription">
            복잡한 준비는 줄이고, 떠나는 설렘은 더 크게.
            <br />
            나에게 맞는 항공권을 쉽고 편하게 찾아보세요.
          </p>
          <div className="heroCaption">
            <span>YOUR NEXT CHAPTER</span>
            <span>어디로 떠나볼까요? ↗</span>
          </div>
          <FlightSearch
            values={values}
            onChange={setValues}
            onSubmit={handleSubmit}
          />
        </div>
      </section>
      <div className="container assurance">
        <span>
          <ShieldCheck /> 분명한 검색 조건
        </span>
        <span>
          <MousePointer2 /> 누구나 쉬운 사용
        </span>
        <span>
          <HeartHandshake /> 함께하는 여행의 시작
        </span>
      </div>

      <section
        className="container section"
        id="destinations"
      >
        <div className="sectionHeading">
          <div>
            <span className="eyebrow">FIND YOUR NEXT DESTINATION</span>
            <h2>다음 여행, 어디가 좋을까요?</h2>
            <p>가볍게 떠나기 좋은 여행지부터 살펴보세요.</p>
          </div>
          <span className="sectionAside">
            <Compass size={18} /> 당신의 새로운 일상
          </span>
        </div>
        <div className="destinationGrid">
          {destinations.map((item) => (
            <button
              className="destinationCard"
              key={item.code}
              onClick={() => handleDestination(item.code)}
              aria-label={`${item.name} 도착지로 선택`}
            >
              <div
                className={`destinationImage ${item.className}`}
                style={{
                  backgroundImage: `url(https://images.unsplash.com/${item.image}?auto=format&fit=crop&w=900&q=80)`,
                }}
              >
                <span className="destinationTag">{item.tag}</span>
                <span className="destinationArrow">
                  <ArrowUpRight size={24} />
                </span>
              </div>
              <div className="destinationInfo">
                <div>
                  <span>{item.country}</span>
                  <h3>{item.name}</h3>
                </div>
                <p>
                  {item.description}
                  <ArrowRight size={17} />
                </p>
              </div>
            </button>
          ))}
        </div>
        <p className="subtleNote">
          여행지를 선택하면 검색창에 도착지가 입력됩니다.
        </p>
      </section>
      <section
        className="container guideSection"
        id="guide"
      >
        <div>
          <span className="eyebrow">TAKE IT EASY</span>
          <h2>
            처음이어도 괜찮아요.
            <br />
            하나씩, 천천히.
          </h2>
          <p>
            여행 준비가 어렵지 않도록
            <br />
            필요한 것만 차근차근 안내할게요.
          </p>
        </div>
        <ol className="steps">
          <li>
            <span>01</span>
            <div>
              <h3>어디로 떠날까요?</h3>
              <p>출발지와 가고 싶은 여행지를 선택해요.</p>
            </div>
          </li>
          <li>
            <span>02</span>
            <div>
              <h3>언제, 누구와 함께하나요?</h3>
              <p>여행 날짜와 인원, 좌석 등급을 정해요.</p>
            </div>
          </li>
          <li>
            <span>03</span>
            <div>
              <h3>항공편을 고르고 예약해요.</h3>
              <p>조회한 항공편을 선택하고 가상 좌석과 결제를 체험해 보세요.</p>
            </div>
          </li>
        </ol>
      </section>
    </>
  );
}
export default HomePage;
