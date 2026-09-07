import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  type AdminRequest,
  ApiError,
  login,
  profile,
  request,
  type RequestOptions,
} from './api';
import {
  AuditPage,
  DashboardPage,
  NotificationsPage,
  OperationsPage,
  OffersPage,
  OrdersPage,
  RestaurantsPage,
  type PortalView,
  UsersPage,
} from './admin-pages';
import type { AuthUser } from './domain';
import { getErrorMessage } from './ui';

const SESSION_TOKEN_KEY = 'wasil.admin.session-token';

const navigation: Array<{
  view: PortalView;
  icon: string;
  label: string;
  detail: string;
}> = [
  { view: 'dashboard', icon: '◫', label: 'Overview', detail: 'Live operational snapshot' },
  { view: 'operations', icon: '◉', label: 'Driver operations', detail: 'Fleet, support & interventions' },
  { view: 'notifications', icon: '✦', label: 'Notifications', detail: 'Customer delivery center' },
  { view: 'users', icon: '◎', label: 'People', detail: 'Accounts & access' },
  { view: 'restaurants', icon: '⌂', label: 'Restaurants', detail: 'Partner moderation' },
  { view: 'orders', icon: '□', label: 'Orders', detail: 'Fulfilment exceptions' },
  { view: 'offers', icon: '◇', label: 'Hot Offers', detail: 'Campaign curation' },
  { view: 'audit', icon: '◌', label: 'Audit log', detail: 'Privileged activity' },
];

type AuthState =
  | { kind: 'loading' }
  | { kind: 'signed-out'; error?: string }
  | { kind: 'ready'; token: string; user: AuthUser };

function safeReadToken() {
  try {
    return window.sessionStorage.getItem(SESSION_TOKEN_KEY);
  } catch {
    return null;
  }
}

function safeWriteToken(token: string | null) {
  try {
    if (token) {
      window.sessionStorage.setItem(SESSION_TOKEN_KEY, token);
    } else {
      window.sessionStorage.removeItem(SESSION_TOKEN_KEY);
    }
  } catch {
    // The portal stays usable if browser storage is blocked; the session will
    // simply end when the tab reloads.
  }
}

function isPortalView(value: string): value is PortalView {
  return navigation.some((item) => item.view === value);
}

function getViewFromLocation(): PortalView {
  const candidate = window.location.hash.replace(/^#\/?/, '');
  return isPortalView(candidate) ? candidate : 'dashboard';
}

function userLabel(user: AuthUser) {
  return `${user.firstName} ${user.lastName}`.trim() || 'Administrator';
}

function Splash() {
  return (
    <main className="boot-screen" aria-live="polite">
      <div className="boot-mark" aria-hidden="true">W</div>
      <p>Opening Wasil Operations…</p>
    </main>
  );
}

function LoginScreen({
  initialError,
  onLogin,
}: {
  initialError?: string;
  onLogin: (email: string, password: string) => Promise<void>;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(initialError ?? '');
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      setError('Enter a valid email address.');
      return;
    }
    if (!password) {
      setError('Enter your password.');
      return;
    }

    setError('');
    setSubmitting(true);
    try {
      await onLogin(normalizedEmail, password);
    } catch (loginError) {
      setError(getErrorMessage(loginError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="login-intro" aria-label="Wasil Operations">
        <div className="login-brand"><span className="brand-mark">W</span><span>wasil</span></div>
        <div className="login-intro__copy">
          <p className="eyebrow">OPERATIONS WORKSPACE</p>
          <h1>Run every delivery with confidence.</h1>
          <p>
            A protected command center for approvals, live orders, partner
            quality, campaigns, and accountability.
          </p>
        </div>
        <div className="login-trust-list">
          <p><span aria-hidden="true">✓</span> Admin-only server authorization</p>
          <p><span aria-hidden="true">✓</span> Account changes recorded in the audit log</p>
          <p><span aria-hidden="true">✓</span> Safe refund and campaign controls</p>
        </div>
      </section>
      <section className="login-panel">
        <div className="login-card">
          <div className="login-card__heading">
            <p className="eyebrow">SECURE SIGN IN</p>
            <h2>Welcome back</h2>
            <p>Use your administrator email and password.</p>
          </div>
          <form noValidate onSubmit={submit}>
            <label className="field" htmlFor="admin-email">
              <span>Email address</span>
              <input
                autoComplete="email"
                autoFocus
                disabled={submitting}
                id="admin-email"
                inputMode="email"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="admin@yourcompany.com"
                type="email"
                value={email}
              />
            </label>
            <label className="field" htmlFor="admin-password">
              <span>Password</span>
              <div className="password-field">
                <input
                  autoComplete="current-password"
                  disabled={submitting}
                  id="admin-password"
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter your password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                />
                <button
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="password-toggle"
                  disabled={submitting}
                  onClick={() => setShowPassword((current) => !current)}
                  type="button">
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </label>
            {error ? <p className="login-error" role="alert">{error}</p> : null}
            <button className="button button--primary login-submit" disabled={submitting} type="submit">
              {submitting ? 'Signing in…' : 'Sign in to Operations'}
            </button>
          </form>
          <p className="login-help">
            Only active Administrator accounts can use this portal. Google
            sign-in is intentionally customer-only.
          </p>
        </div>
      </section>
    </main>
  );
}

function OperationsShell({
  currentView,
  user,
  onNavigate,
  onLogout,
  children,
}: {
  currentView: PortalView;
  user: AuthUser;
  onNavigate: (view: PortalView) => void;
  onLogout: () => void;
  children: React.ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  function navigate(view: PortalView) {
    onNavigate(view);
    setMenuOpen(false);
  }

  return (
    <div className="portal-shell">
      <aside className={`sidebar ${menuOpen ? 'sidebar--open' : ''}`}>
        <div className="sidebar__top">
          <button className="sidebar-brand" onClick={() => navigate('dashboard')} type="button">
            <span className="brand-mark" aria-hidden="true">W</span>
            <span>wasil</span>
          </button>
          <span className="sidebar-badge">OPERATIONS</span>
        </div>
        <nav aria-label="Admin navigation" className="sidebar-nav">
          {navigation.map((item) => (
            <button
              aria-current={currentView === item.view ? 'page' : undefined}
              className={`sidebar-link ${currentView === item.view ? 'sidebar-link--active' : ''}`}
              key={item.view}
              onClick={() => navigate(item.view)}
              type="button">
              <span aria-hidden="true" className="sidebar-link__icon">{item.icon}</span>
              <span><strong>{item.label}</strong><small>{item.detail}</small></span>
            </button>
          ))}
        </nav>
        <div className="sidebar__bottom">
          <div className="operator-card">
            <span className="avatar avatar--dark" aria-hidden="true">{user.firstName.charAt(0).toUpperCase() || 'A'}</span>
            <span><strong>{userLabel(user)}</strong><small>{user.email ?? 'Administrator'}</small></span>
          </div>
          <button className="sidebar-logout" onClick={onLogout} type="button">Sign out <span aria-hidden="true">→</span></button>
        </div>
      </aside>
      {menuOpen ? <button aria-label="Close navigation" className="sidebar-scrim" onClick={() => setMenuOpen(false)} type="button" /> : null}
      <div className="portal-main">
        <header className="portal-topbar">
          <button aria-label="Open navigation" className="mobile-menu-button" onClick={() => setMenuOpen(true)} type="button">☰</button>
          <div className="portal-topbar__context"><span className="live-dot" aria-hidden="true" /> Live operations</div>
          <div className="portal-topbar__right"><span>Administrator</span><button className="topbar-avatar" onClick={() => navigate('users')} title="People and access" type="button">{user.firstName.charAt(0).toUpperCase() || 'A'}</button></div>
        </header>
        <main className="portal-content">{children}</main>
      </div>
    </div>
  );
}

export function App() {
  const [auth, setAuth] = useState<AuthState>({ kind: 'loading' });
  const [view, setView] = useState<PortalView>(() => getViewFromLocation());

  useEffect(() => {
    function updateView() {
      setView(getViewFromLocation());
    }
    window.addEventListener('hashchange', updateView);
    return () => window.removeEventListener('hashchange', updateView);
  }, []);

  useEffect(() => {
    let current = true;
    const token = safeReadToken();
    if (!token) {
      setAuth({ kind: 'signed-out' });
      return () => {
        current = false;
      };
    }

    void profile(token)
      .then(({ user }) => {
        if (!current) return;
        if (user.role !== 'ADMIN' || user.accountStatus !== 'ACTIVE') {
          safeWriteToken(null);
          setAuth({ kind: 'signed-out', error: 'This account is not permitted to access Operations.' });
          return;
        }
        setAuth({ kind: 'ready', token, user });
      })
      .catch(() => {
        if (!current) return;
        safeWriteToken(null);
        setAuth({ kind: 'signed-out', error: 'Your session has ended. Please sign in again.' });
      });

    return () => {
      current = false;
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const response = await login(email, password);
    const verified = await profile(response.token);
    if (
      verified.user.role !== 'ADMIN' ||
      verified.user.accountStatus !== 'ACTIVE'
    ) {
      safeWriteToken(null);
      throw new ApiError('This account is not permitted to access Operations.', 403);
    }
    safeWriteToken(response.token);
    setAuth({ kind: 'ready', token: response.token, user: verified.user });
  }, []);

  const signOut = useCallback(() => {
    safeWriteToken(null);
    setAuth({ kind: 'signed-out' });
  }, []);

  const navigate = useCallback((next: PortalView) => {
    if (window.location.hash !== `#${next}`) {
      window.location.hash = next;
    }
    setView(next);
  }, []);

  const adminRequest: AdminRequest = useCallback(
    <T,>(path: string, options?: RequestOptions) => {
      if (auth.kind !== 'ready') {
        return Promise.reject(new ApiError('Your session has ended. Please sign in again.', 401));
      }
      return request<T>(path, options, auth.token);
    },
    [auth],
  );

  const page = useMemo(() => {
    if (auth.kind !== 'ready') return null;
    const pageProps = {
      currentUser: auth.user,
      navigate,
      request: adminRequest,
    };
    switch (view) {
      case 'users': return <UsersPage {...pageProps} />;
      case 'operations': return <OperationsPage {...pageProps} />;
      case 'notifications': return <NotificationsPage {...pageProps} />;
      case 'restaurants': return <RestaurantsPage {...pageProps} />;
      case 'orders': return <OrdersPage {...pageProps} />;
      case 'offers': return <OffersPage {...pageProps} />;
      case 'audit': return <AuditPage {...pageProps} />;
      default: return <DashboardPage {...pageProps} />;
    }
  }, [adminRequest, auth, navigate, view]);

  if (auth.kind === 'loading') return <Splash />;
  if (auth.kind === 'signed-out') {
    return <LoginScreen initialError={auth.error} onLogin={signIn} />;
  }

  return (
    <OperationsShell
      currentView={view}
      onLogout={signOut}
      onNavigate={navigate}
      user={auth.user}>
      {page}
    </OperationsShell>
  );
}
