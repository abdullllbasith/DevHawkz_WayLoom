"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { BrandLogo } from "./brand-logo";
import {
  ROLE_OPTIONS,
  roleWorkspace,
  validateLoginForm,
  type LoginFormErrors,
  type UserRole,
} from "../lib/auth-client";

export function LoginForm() {
  const router = useRouter();

  const [loginIdentifier, setLoginIdentifier] = useState("seed.dispatcher");
  const [password, setPassword] = useState("wayloom-dev-only");
  const [selectedRole, setSelectedRole] = useState<UserRole>("DISPATCHER");
  const [showPassword, setShowPassword] = useState(false);
  const [inFlight, setInFlight] = useState(false);
  const [errors, setErrors] = useState<LoginFormErrors>({});

  const handleRoleSelect = (role: UserRole) => {
    setSelectedRole(role);
    const matched = ROLE_OPTIONS.find((r) => r.id === role);
    if (matched?.defaultLogin) {
      setLoginIdentifier(matched.defaultLogin);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const validation = validateLoginForm({ loginIdentifier, password });
    if (Object.keys(validation).length > 0) {
      setErrors(validation);
      return;
    }

    setInFlight(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          loginIdentifier: loginIdentifier.trim(),
          password,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setInFlight(false);
        if (response.status === 401) {
          setErrors({ general: "Invalid work email or password. Please try again." });
          return;
        }
        if (response.status === 429) {
          setErrors({ general: "Too many failed attempts. Please wait a few minutes." });
          return;
        }
        setErrors({
          general: data?.error?.message || "Authentication failed. Please verify the API is running.",
        });
        return;
      }

      const userRole = data?.user?.role || selectedRole;
      const targetWorkspace = roleWorkspace(userRole);
      router.push(targetWorkspace);
      router.refresh();
    } catch {
      setInFlight(false);
      setErrors({
        general: "Unable to connect to the login service. Please ensure the WayLoom API is running.",
      });
    }
  };

  return (
    <div className="login-root">
      {/* Top Navbar */}
      <header className="login-navbar">
        <div className="login-brand">
          <BrandLogo size="login" />
        </div>

        <div className="login-lang-picker">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
          <span>English (EN)</span>
          <span className="carat-down" aria-hidden="true">⌵</span>
        </div>
      </header>

      {/* Main Split Grid */}
      <main className="login-main-layout">
        {/* Left Side: Brand Story & Warehouse Illustration */}
        <section className="login-hero-panel" aria-label="WayLoom Overview">
          <div className="login-hero-text-block">
            <div className="login-eyebrow">— A SMARTER WAY TO DELIVER</div>
            <h1 className="login-hero-title">
              AI-Powered<br />
              Delivery Operations
            </h1>
            <p className="login-hero-subtitle">
              Plan smarter, move faster, and keep your supply
              chain ahead with intelligent operations.
            </p>
          </div>

          <div className="login-illustration-container">
            <img className="login-illustration-svg" src="/login-dock.png" alt="Delivery trucks at a warehouse dock" />
          </div>
        </section>

        {/* Right Side: Welcome Back Card */}
        <section className="login-card-container" aria-label="Sign In Form">
          <div className="login-card">
            <h2 className="login-card-title">Welcome Back</h2>
            <p className="login-card-subtitle">Sign in to continue to WayLoom</p>

            {errors.general && (
              <div className="login-alert-error" role="alert">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span>{errors.general}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} noValidate>
              {/* Field: Work Email */}
              <div className="form-group">
                <label htmlFor="loginIdentifier" className="form-label">
                  Work Email
                </label>
                <div className={`input-container ${errors.loginIdentifier ? "input-error" : ""}`}>
                  <svg className="input-leading-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="2" y="4" width="20" height="16" rx="2" />
                    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                  </svg>
                  <input
                    id="loginIdentifier"
                    name="loginIdentifier"
                    type="text"
                    className="form-input"
                    placeholder="you@company.com"
                    value={loginIdentifier}
                    onChange={(e) => setLoginIdentifier(e.target.value)}
                    autoComplete="username"
                    required
                  />
                </div>
                {errors.loginIdentifier && (
                  <span className="field-error-text">{errors.loginIdentifier}</span>
                )}
              </div>

              {/* Field: Password */}
              <div className="form-group">
                <label htmlFor="password" className="form-label">
                  Password
                </label>
                <div className={`input-container ${errors.password ? "input-error" : ""}`}>
                  <svg className="input-leading-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    className="form-input"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    className="password-toggle-btn"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      {showPassword ? (
                        <>
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                          <line x1="1" y1="1" x2="23" y2="23" />
                        </>
                      ) : (
                        <>
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </>
                      )}
                    </svg>
                  </button>
                </div>
                {errors.password && (
                  <span className="field-error-text">{errors.password}</span>
                )}
              </div>

              {/* Forgot password link */}
              <div className="forgot-password-row">
                <button
                  type="button"
                  className="forgot-password-link"
                  onClick={() => alert("Please contact your system administrator to reset credentials.")}
                >
                  Forgot password?
                </button>
              </div>

              {/* Continue As Role Selector */}
              <div className="role-selector-section">
                <div className="role-section-label">Continue as</div>
                <div className="role-grid" role="radiogroup" aria-label="Select role">
                  {ROLE_OPTIONS.map((opt) => {
                    const isSelected = selectedRole === opt.id;
                    return (
                      <div
                        key={opt.id}
                        role="radio"
                        aria-checked={isSelected}
                        tabIndex={0}
                        className={`role-card ${isSelected ? "selected" : ""}`}
                        onClick={() => handleRoleSelect(opt.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            handleRoleSelect(opt.id);
                          }
                        }}
                      >
                        <div className="role-card-top">
                          <span className="role-icon-box" aria-hidden="true">
                            {renderRoleIcon(opt.id)}
                          </span>
                          <span className={`role-radio-circle ${isSelected ? "checked" : ""}`} aria-hidden="true">
                            {isSelected && <span className="role-radio-dot" />}
                          </span>
                        </div>
                        <div className="role-card-name">{opt.label}</div>
                        <div className="role-card-subtitle">{opt.subtitle}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={inFlight}
                className="login-submit-btn"
                aria-label="Sign in"
              >
                {inFlight ? (
                  <span>Signing In...</span>
                ) : (
                  <>
                    <span>Sign In</span>
                    <span aria-hidden="true">→</span>
                  </>
                )}
              </button>

              {/* Footnote */}
              <div className="login-footnote">
                Need help? Contact your system administrator.
              </div>
            </form>
          </div>
        </section>
      </main>
    </div>
  );
}

function renderRoleIcon(role: UserRole) {
  switch (role) {
    case "DISPATCHER":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      );
    case "LOADER":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
          <line x1="12" y1="22.08" x2="12" y2="12" />
        </svg>
      );
    case "DRIVER":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="1" y="3" width="15" height="13" />
          <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
          <circle cx="5.5" cy="18.5" r="2.5" />
          <circle cx="18.5" cy="18.5" r="2.5" />
        </svg>
      );
    case "STORE_MANAGER":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
      );
    default:
      return null;
  }
}
