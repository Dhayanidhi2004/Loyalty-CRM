import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BRAND } from '../config';
import { useApp } from '../AppContext';
import { fileUrl } from '../api';
import { initials } from '../format';

function Brand() {
  const [imgOk, setImgOk] = useState(true);
  return (
    <Link to="/" className="brand" aria-label={BRAND.companyName}>
      {imgOk ? (
        <img src={BRAND.logoUrl} alt={BRAND.logoText} onError={() => setImgOk(false)} />
      ) : (
        <>
          <div className="brand-badge"><span>{BRAND.logoInitials}</span></div>
          <div className="brand-text">
            <span className="brand-name">{BRAND.logoText}</span>
            <span className="brand-tag">{BRAND.tagline}</span>
          </div>
        </>
      )}
    </Link>
  );
}

// White header + frame. The original uses two looks:
//   variant="dark"  -> black frame, light-grey title (login and the dashboards)
//   variant="light" -> white frame, dark title (every inner page)
export default function Shell({ children, tinted = false, variant = 'light' }) {
  const { logout } = useApp();
  const navigate = useNavigate();
  return (
    <>
      <header className="site-header">
        <Brand />
        <h1 className={`site-title${variant === 'light' ? ' strong' : ''}`}>{BRAND.companyName}</h1>
        <button
          className="logout-btn"
          onClick={() => {
            logout();
            navigate('/login');
          }}
        >
          Logout
        </button>
      </header>
      <div className={`frame${variant === 'light' ? ' light' : ''}`}>
        <div className={`frame-inner${tinted ? ' tinted' : ''}`}>{children}</div>
      </div>
    </>
  );
}

// "● Enterprise CRM / Admin Dashboard ........ Admin (A)"
export function DashBar({ subtitle, children }) {
  const { user } = useApp();
  const isAdmin = user?.role === 'admin';
  return (
    <div className="dash-bar">
      <div className="dash-bar-inner">
        <div className="dash-id">
          <span className="dash-dot" />
          <div>
            <h2>{BRAND.appTitle}</h2>
            <p>{subtitle}</p>
          </div>
          {children}
        </div>
        <div className="dash-user">
          <span>{isAdmin ? 'Admin' : user?.name}</span>
          <div className="avatar-a">
            {user?.photo ? <img src={fileUrl(user.photo)} alt="" /> : isAdmin ? 'A' : initials(user?.name)}
          </div>
        </div>
      </div>
    </div>
  );
}
