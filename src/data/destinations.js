const domesticAirports = [
  { code: 'ICN', name: '서울 인천' },
  { code: 'GMP', name: '서울 김포' },
  { code: 'PUS', name: '부산 김해' },
  { code: 'CJU', name: '제주' },
  { code: 'TAE', name: '대구' },
  { code: 'CJJ', name: '청주' },
  { code: 'MWX', name: '무안' },
  { code: 'KWJ', name: '광주' },
  { code: 'RSU', name: '여수' },
  { code: 'USN', name: '울산' },
  { code: 'YNY', name: '양양' },
  { code: 'KPO', name: '포항경주' },
  { code: 'HIN', name: '사천' },
  { code: 'KUV', name: '군산' },
  { code: 'WJU', name: '원주' },
];

export const airportGroups = [
  { label: '국내', airports: domesticAirports },
  {
    label: '일본',
    airports: [
      { code: 'HND', name: '도쿄 하네다' },
      { code: 'NRT', name: '도쿄 나리타' },
      { code: 'KIX', name: '오사카 간사이' },
      { code: 'FUK', name: '후쿠오카' },
      { code: 'CTS', name: '삿포로 신치토세' },
      { code: 'OKA', name: '오키나와 나하' },
      { code: 'NGO', name: '나고야 주부' },
    ],
  },
  {
    label: '동아시아',
    airports: [
      { code: 'TPE', name: '타이베이 타오위안' },
      { code: 'KHH', name: '가오슝' },
      { code: 'HKG', name: '홍콩' },
      { code: 'MFM', name: '마카오' },
      { code: 'PEK', name: '베이징 서우두' },
      { code: 'PVG', name: '상하이 푸둥' },
    ],
  },
  {
    label: '동남아',
    airports: [
      { code: 'BKK', name: '방콕 수완나품' },
      { code: 'DAD', name: '다낭' },
      { code: 'HAN', name: '하노이' },
      { code: 'SGN', name: '호치민' },
      { code: 'CXR', name: '나트랑 깜라인' },
      { code: 'CEB', name: '세부' },
      { code: 'SIN', name: '싱가포르 창이' },
      { code: 'DPS', name: '발리 덴파사르' },
    ],
  },
  {
    label: '미주·대양주',
    airports: [
      { code: 'GUM', name: '괌' },
      { code: 'SPN', name: '사이판' },
      { code: 'HNL', name: '호놀룰루' },
      { code: 'LAX', name: '로스앤젤레스' },
      { code: 'JFK', name: '뉴욕 존 F. 케네디' },
      { code: 'SYD', name: '시드니' },
    ],
  },
  {
    label: '유럽',
    airports: [
      { code: 'CDG', name: '파리 샤를 드골' },
      { code: 'LHR', name: '런던 히스로' },
      { code: 'FRA', name: '프랑크푸르트' },
    ],
  },
];

export const airports = airportGroups.flatMap((group) => group.airports);

export function isDomesticRoute({ from, to, segments }) {
  const codes = [
    from,
    to,
    ...(segments?.flatMap((leg) => [leg.from, leg.to]) ?? []),
  ];
  return codes.every((code) =>
    domesticAirports.some((airport) => airport.code === code),
  );
}

export const destinations = [
  {
    code: 'CJU',
    name: '제주',
    country: '대한민국',
    tag: '가까운 곳에서 쉬어가기',
    image: 'photo-1507525428034-b723cf961d3e',
    className: 'jeju',
    description: '푸른 바다와 느긋한 하루',
  },
  {
    code: 'NRT',
    name: '도쿄',
    country: '일본',
    tag: '도시의 새로운 발견',
    image: 'photo-1540959733332-eab4deabeeaf',
    className: 'tokyo',
    description: '익숙함과 새로움 사이',
  },
  {
    code: 'DAD',
    name: '다낭',
    country: '베트남',
    tag: '따뜻한 휴식이 필요할 때',
    image: 'photo-1559592413-7cec4d0cae2b',
    className: 'danang',
    description: '햇살을 따라 떠나는 여행',
  },
];
