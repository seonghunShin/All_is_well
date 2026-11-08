import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Clock3 } from 'lucide-react';
import { useBooking } from '../BookingContext';
import { PageTitle } from '../components/BookingUI';
function QueuePage() {
  const { draft } = useBooking();
  const navigate = useNavigate();
  const [remaining, setRemaining] = useState(12);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return;
    const timer = setInterval(
      () => setRemaining((prev) => Math.max(0, prev - 1)),
      1000,
    );
    return () => clearInterval(timer);
  }, [paused]);
  useEffect(() => {
    if (remaining === 0)
      navigate(draft && !draft.completedId ? '/flights' : '/', {
        replace: true,
      });
  }, [remaining, draft, navigate]);
  return (
    <div className="queuePage container">
      <div className="queueIcon">
        <Clock3 size={44} />
      </div>
      <PageTitle
        eyebrow="A LITTLE MOMENT"
        title="잠시만 기다려 주세요."
      >
        편안한 이용을 위해 순서대로 안내하고 있어요.
      </PageTitle>
      <div className="queueCard">
        <span>내 앞의 대기 인원 (예시)</span>
        <strong>
          {remaining * 8}
          <small>명</small>
        </strong>
        <progress
          max={12}
          value={12 - remaining}
          aria-label="입장 대기 진행률"
        />
        <p>예상 대기 시간 약 {remaining}초</p>
        <p className="muted">대기 완료 후 자동으로 이동합니다.</p>
      </div>
      <p className="notice">
        12초짜리 프론트엔드 시뮬레이션입니다. 실제 대기 순서·예상 시간은 서버
        연동 후 제공됩니다.
      </p>
      <div className="centerActions">
        <button
          className="secondary"
          onClick={() => setPaused((prev) => !prev)}
        >
          {paused ? '체험 재개' : '체험 일시정지'}
        </button>
        <Link
          className="textLink"
          to="/"
        >
          대기 취소 · 홈으로
        </Link>
      </div>
    </div>
  );
}
export default QueuePage;
