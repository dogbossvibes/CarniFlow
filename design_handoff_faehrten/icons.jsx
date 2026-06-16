// ANYVO icons — thin line set, currentColor stroke
(function () {
  const S = ({ d, fill, w = 22, vb = 24, sw = 1.8, children, style }) => (
    <svg width={w} height={w} viewBox={`0 0 ${vb} ${vb}`} fill="none"
      stroke={fill ? 'none' : 'currentColor'} strokeWidth={sw}
      strokeLinecap="round" strokeLinejoin="round" style={style}>
      {d ? <path d={d} fill={fill ? 'currentColor' : 'none'} /> : children}
    </svg>
  );

  const Icon = {
    paw: (p) => <S {...p} fill children={
      <g fill="currentColor" stroke="none">
        <ellipse cx="7" cy="9.5" rx="2" ry="2.6"/><ellipse cx="12" cy="7.6" rx="2.1" ry="2.8"/>
        <ellipse cx="17" cy="9.5" rx="2" ry="2.6"/>
        <path d="M12 11.5c2.7 0 4.8 1.9 4.8 4.1 0 1.7-1.5 2.6-3.1 2.6-.8 0-1.1-.3-1.7-.3s-.9.3-1.7.3c-1.6 0-3.1-.9-3.1-2.6 0-2.2 2.1-4.1 4.8-4.1z"/>
      </g>} />,
    route: (p) => <S {...p} children={
      <g><circle cx="5.5" cy="18.5" r="2.4"/><circle cx="18.5" cy="5.5" r="2.4"/>
      <path d="M7.7 17.2C12 15 9 9.5 13.4 7.1" strokeDasharray="0.1 3.4"/></g>} />,
    target: (p) => <S {...p} children={
      <g><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.6"/><path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3"/></g>} />,
    flag: (p) => <S {...p} d="M6 21V4m0 1h11l-2 3.2L17 11H6" />,
    timer: (p) => <S {...p} children={<g><circle cx="12" cy="13.5" r="7.5"/><path d="M12 13.5V9M9.5 2.5h5M12 6V2.6"/></g>} />,
    wind: (p) => <S {...p} d="M3 8h11a2.6 2.6 0 1 0-2.6-2.6M3 16h15a2.6 2.6 0 1 1-2.6 2.6M3 12h8.5" />,
    drop: (p) => <S {...p} d="M12 3.5C12 3.5 5.5 10 5.5 14.5a6.5 6.5 0 0 0 13 0C18.5 10 12 3.5 12 3.5z" />,
    temp: (p) => <S {...p} children={<g><path d="M14 13.6V5a2 2 0 0 0-4 0v8.6a4 4 0 1 0 4 0z"/><path d="M12 8v6.5"/></g>} />,
    chart: (p) => <S {...p} d="M4 20V4M4 20h16M8 16l3.5-4 3 2.5L20 8" />,
    layers: (p) => <S {...p} d="M12 3 3 8l9 5 9-5-9-5zM3 14l9 5 9-5M3 11l9 5 9-5" />,
    clock: (p) => <S {...p} children={<g><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></g>} />,
    plus: (p) => <S {...p} d="M12 5v14M5 12h14" />,
    chevR: (p) => <S {...p} d="M9 5l7 7-7 7" />,
    chevL: (p) => <S {...p} d="M15 5l-7 7 7 7" />,
    chevD: (p) => <S {...p} d="M5 9l7 7 7-7" />,
    check: (p) => <S {...p} d="M4 12.5l5 5 11-11" />,
    x: (p) => <S {...p} d="M6 6l12 12M18 6L6 18" />,
    play: (p) => <S {...p} fill children={<path fill="currentColor" stroke="none" d="M7 4.5v15l13-7.5z"/>} />,
    pause: (p) => <S {...p} children={<g><rect x="6.5" y="5" width="3.4" height="14" rx="1.2" fill="currentColor" stroke="none"/><rect x="14.1" y="5" width="3.4" height="14" rx="1.2" fill="currentColor" stroke="none"/></g>} />,
    stop: (p) => <S {...p} children={<rect x="6" y="6" width="12" height="12" rx="3" fill="currentColor" stroke="none"/>} />,
    pin: (p) => <S {...p} d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z" />,
    angle: (p) => <S {...p} d="M5 19h14M5 19L5 5M5 19c0-5 2.5-9.5 8-12" />,
    ruler: (p) => <S {...p} d="M3 14.5 14.5 3l6.5 6.5L9.5 21 3 14.5zM7 13l2 2M10.5 9.5l2 2M14 6l2 2" />,
    home: (p) => <S {...p} d="M4 11l8-7 8 7M6 9.5V20h12V9.5" />,
    dumbbell: (p) => <S {...p} d="M3 9v6M6 7v10M18 7v10M21 9v6M6 12h12" />,
    grid: (p) => <S {...p} children={<g><rect x="4" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.6"/></g>} />,
    user: (p) => <S {...p} children={<g><circle cx="12" cy="8" r="4"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/></g>} />,
    map: (p) => <S {...p} d="M9 3 3.5 5.2v15.3L9 18.3l6 2.4 5.5-2.2V3.2L15 5.4 9 3zM9 3v15.3M15 5.4v15.3" />,
    sparkle: (p) => <S {...p} d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" />,
    filter: (p) => <S {...p} d="M4 6h16M7 12h10M10 18h4" />,
    bell: (p) => <S {...p} d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6M10 19a2 2 0 0 0 4 0" />,
    edit: (p) => <S {...p} d="M5 19h14M7 16l9.5-9.5a2 2 0 0 0-3-3L4 13l-1 4 4-1z" />,
    leaf: (p) => <S {...p} d="M5 19c0-8 6-13 14-13 0 8-5 14-13 14a8 8 0 0 1-1-1zm0 0c2-5 5-7 8-8.5" />,
  };

  window.Icon = Icon;
})();
