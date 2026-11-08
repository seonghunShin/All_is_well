import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useBooking } from '../BookingContext';
import { PageTitle } from '../components/BookingUI';
function AuthPage({ mode = 'login' }) {
  const { user, setUser } = useBooking();
  const navigate = useNavigate();
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const titles = {
    login: '다시 만나 반가워요.',
    signup: '함께 여행을 시작해요.',
    reset: '비밀번호를 잊으셨나요?',
    profile: '내 정보를 관리해요.',
  };
  function submit(event) {
    event.preventDefault();
    setError('');
    if (mode === 'signup' && password !== confirmation) {
      setError('비밀번호가 일치하지 않아요.');
      return;
    }
    if (mode === 'reset') {
      setMessage(
        '재설정 요청 화면 체험이 완료되었습니다. 실제 이메일은 발송되지 않습니다.',
      );
      return;
    }
    setUser({ name: name.trim() || email.split('@')[0], email });
    if (mode === 'profile') setMessage('체험 회원정보를 변경했어요.');
    else navigate('/bookings');
  }
  if (mode === 'profile' && !user)
    return (
      <div className="container flowPage emptyPanel">
        <h1>체험 로그인이 필요해요.</h1>
        <Link
          className="primary"
          to="/login"
        >
          로그인 화면으로
        </Link>
      </div>
    );
  return (
    <div className="authPage">
      <aside className="authVisual">
        <span className="eyebrow">ALL IS WELL</span>
        <h2>
          어디로 떠나든,
          <br />
          마음 편하게.
        </h2>
        <p>
          당신의 다음 여행을
          <br />
          함께 준비할게요.
        </p>
        <div className="authOrb">✈</div>
      </aside>
      <section className="authForm">
        <PageTitle title={titles[mode]} />
        <p className="notice">
          프론트엔드 체험입니다. 실제 계정이 생성되거나 인증되지 않습니다.
          임의의 이메일과 비밀번호를 사용하세요.
        </p>
        <form
          onSubmit={submit}
          className="formStack"
        >
          {['signup', 'profile'].includes(mode) && (
            <label className="stackLabel">
              이름
              <input
                required
                minLength={2}
                maxLength={40}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
          )}
          <label className="stackLabel">
            이메일
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="demo@example.com"
            />
          </label>
          {['login', 'signup'].includes(mode) && (
            <label className="stackLabel">
              체험용 비밀번호
              <input
                type="password"
                autoComplete="off"
                required
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="8자 이상 · 저장되지 않습니다"
              />
            </label>
          )}
          {mode === 'signup' && (
            <>
              <label className="stackLabel">
                비밀번호 확인
                <input
                  type="password"
                  autoComplete="off"
                  required
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                />
              </label>
              <label className="checkboxLabel">
                <input
                  type="checkbox"
                  required
                />
                실제 계정이 아닌 체험 화면임을 확인했어요.
              </label>
            </>
          )}
          {error && (
            <p
              role="alert"
              className="formError"
            >
              {error}
            </p>
          )}
          {message && (
            <p
              role="status"
              className="notice"
            >
              {message}
            </p>
          )}
          <button className="primary">
            {
              {
                login: '체험 로그인',
                signup: '체험 가입',
                reset: '재설정 안내 확인',
                profile: '변경 저장',
              }[mode]
            }
          </button>
        </form>
        <div className="authLinks">
          <Link to="/login">로그인</Link>
          <Link to="/signup">회원가입</Link>
          <Link to="/reset-password">비밀번호 찾기</Link>
        </div>
        {mode === 'profile' && (
          <button
            className="textLink"
            onClick={() => {
              setUser(null);
              navigate('/login');
            }}
          >
            로그아웃
          </button>
        )}
      </section>
    </div>
  );
}
export default AuthPage;
