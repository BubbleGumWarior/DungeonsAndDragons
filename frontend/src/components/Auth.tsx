import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';

type AuthMode = 'login' | 'register';

interface FormData {
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
}

interface ValidationErrors {
  username?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
}

interface AuthProps {
  initialMode?: AuthMode;
}

const Auth: React.FC<AuthProps> = ({ initialMode = 'login' }) => {
  const { login, register, error, clearError, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [formData, setFormData] = useState<FormData>({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({});
  const [touchedFields, setTouchedFields] = useState<Record<string, boolean>>({});
  const [authError, setAuthError] = useState<string | null>(null);

  const formRef = useRef<HTMLFormElement>(null);
  const usernameInputRef = useRef<HTMLInputElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const confirmPasswordInputRef = useRef<HTMLInputElement>(null);

  // Clear errors when switching modes
  useEffect(() => {
    clearError();
    setValidationErrors({});
    setAuthError(null);
  }, [mode, clearError]);

  // Sync context error to local state
  useEffect(() => {
    if (error) {
      setAuthError(error);
    }
  }, [error]);

  const validateField = (name: string, value: string): string => {
    switch (name) {
      case 'username':
        if (mode === 'register' && (value.length < 3 || value.length > 50)) {
          return 'Username must be between 3 and 50 characters';
        }
        return '';

      case 'email':
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(value)) {
          return 'Please enter a valid email address';
        }
        return '';

      case 'password':
        if (mode === 'register') {
          // Match backend validation exactly: at least 8 characters, one uppercase, one lowercase, one number
          if (value.length < 8) {
            return 'Password must be at least 8 characters';
          }
          if (!/[A-Z]/.test(value)) {
            return 'Password must contain at least one uppercase letter';
          }
          if (!/[a-z]/.test(value)) {
            return 'Password must contain at least one lowercase letter';
          }
          if (!/\d/.test(value)) {
            return 'Password must contain at least one number';
          }
        } else {
          // For login, just check minimum length
          if (value.length < 1) {
            return 'Password is required';
          }
        }
        return '';

      case 'confirmPassword':
        if (mode === 'register' && value !== formData.password) {
          return 'Passwords do not match';
        }
        return '';

      default:
        return '';
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));

    // Clear validation error for this field
    if (validationErrors[name as keyof ValidationErrors]) {
      setValidationErrors(prev => ({ ...prev, [name]: '' }));
    }

    // Clear auth error when user starts typing
    if (error) {
      clearError();
    }
  };

  const handleInputBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setTouchedFields(prev => ({ ...prev, [name]: true }));

    const fieldError = validateField(name, value);
    if (fieldError) {
      setValidationErrors(prev => ({ ...prev, [name]: fieldError }));
    }
  };

  const validateForm = (): boolean => {
    const errors: ValidationErrors = {};
    
    // Validate email and password for both modes
    const emailError = validateField('email', formData.email);
    if (emailError) errors.email = emailError;

    const passwordError = validateField('password', formData.password);
    if (passwordError) errors.password = passwordError;

    // Validate username and confirm password only for register mode
    if (mode === 'register') {
      const usernameError = validateField('username', formData.username);
      if (usernameError) errors.username = usernameError;

      const confirmPasswordError = validateField('confirmPassword', formData.confirmPassword);
      if (confirmPasswordError) errors.confirmPassword = confirmPasswordError;
    }

    setValidationErrors(errors);
    
    // Focus on the first field with an error
    if (Object.keys(errors).length > 0) {
      const firstErrorField = Object.keys(errors)[0];
      const fieldRefs: Record<string, React.RefObject<HTMLInputElement | null>> = {
        username: usernameInputRef,
        email: emailInputRef,
        password: passwordInputRef,
        confirmPassword: confirmPasswordInputRef
      };
      
      if (fieldRefs[firstErrorField]?.current) {
        setTimeout(() => {
          fieldRefs[firstErrorField].current?.focus();
        }, 0);
      }
    }
    
    return Object.keys(errors).length === 0;
  };

  const handleModeSwitch = (newMode: AuthMode) => {
    if (newMode === mode || isTransitioning) return;

    setIsTransitioning(true);
    
    // Clear form data that's specific to the mode we're leaving
    if (newMode === 'login') {
      setFormData(prev => ({ ...prev, username: '', confirmPassword: '' }));
    }
    
    setValidationErrors({});
    setTouchedFields({});
    clearError();

    // Add a small delay for smooth transition
    setTimeout(() => {
      setMode(newMode);
      setTimeout(() => {
        setIsTransitioning(false);
      }, 100);
    }, 150);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm() || isLoading || isTransitioning) {
      return;
    }

    try {
      setAuthError(null);
      
      if (mode === 'login') {
        await login(formData.email, formData.password);
        // Navigate to dashboard or the page they were trying to access
        const from = location.state?.from?.pathname || '/dashboard';
        navigate(from, { replace: true });
      } else {
        await register(formData.username, formData.email, formData.password, formData.confirmPassword);
        // Navigate to dashboard after successful registration
        navigate('/dashboard', { replace: true });
      }
    } catch (err: any) {
      // Error is already handled by the context and synced to authError
      // The error message will be displayed in the UI
    }
  };

  const getFieldError = (fieldName: keyof ValidationErrors): string => {
    return touchedFields[fieldName] ? (validationErrors[fieldName] || '') : '';
  };

  const getDisplayErrorMessage = (error: string): { title: string; message: string } => {
    // Map common error messages to more user-friendly versions with suggestions
    const errorMap: Record<string, { title: string; message: string }> = {
      'Email already registered': {
        title: 'Email Already Registered',
        message: 'This email is already in use. Please try logging in or use a different email address.'
      },
      'Username already taken': {
        title: 'Username Unavailable',
        message: 'This username is already taken. Please choose a different username.'
      },
      'Invalid credentials': {
        title: 'Invalid Credentials',
        message: 'The email or password you entered is incorrect. Please try again.'
      },
      'All fields are required': {
        title: 'Missing Information',
        message: 'Please fill in all required fields before submitting.'
      },
      'Passwords do not match': {
        title: 'Password Mismatch',
        message: 'The passwords you entered do not match. Please check and try again.'
      },
      'Invalid email format': {
        title: 'Invalid Email',
        message: 'Please enter a valid email address.'
      },
      'Email and password are required': {
        title: 'Login Information Required',
        message: 'Please enter both your email and password.'
      },
      'Internal server error': {
        title: 'Server Error',
        message: 'Something went wrong on our end. Please try again later.'
      }
    };

    return errorMap[error] || {
      title: 'An Error Occurred',
      message: error
    };
  };

  const getFieldClassName = (fieldName: keyof ValidationErrors): string => {
    const baseClass = 'form-input';
    const hasError = touchedFields[fieldName] && validationErrors[fieldName];
    const hasValue = formData[fieldName as keyof FormData];
    
    if (hasError) return `${baseClass} error`;
    if (hasValue && touchedFields[fieldName]) return `${baseClass} success`;
    return baseClass;
  };

  return (
    <div className="container fade-in" style={{ 
      minHeight: '100vh', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center', 
      padding: 'var(--spacing-md)' 
    }}>
      <div className="dashboard-container" style={{ maxWidth: '500px', margin: '2rem auto' }}>
        {/* Header */}
        <div className="app-header">
          <h1 className="app-title">Dungeon Lair</h1>
          <p className="app-subtitle">Your D&D Adventure Awaits</p>
        </div>

        {/* Mode Toggle using glass panel */}
        <div className="glass-panel primary" style={{ 
          display: 'flex', 
          padding: '4px', 
          marginBottom: 'var(--spacing-lg)' 
        }}>
          <button
            type="button"
            className={`btn ${mode === 'login' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ flex: 1, margin: '0 2px', fontSize: '0.9rem' }}
            onClick={() => handleModeSwitch('login')}
            disabled={isTransitioning || isLoading}
          >
            Login
          </button>
          <button
            type="button"
            className={`btn ${mode === 'register' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ flex: 1, margin: '0 2px', fontSize: '0.9rem' }}
            onClick={() => handleModeSwitch('register')}
            disabled={isTransitioning || isLoading}
          >
            Register
          </button>
        </div>

        {/* Form in glass panel */}
        <div className="glass-panel">
          <form 
            ref={formRef}
            onSubmit={handleSubmit} 
            style={{ 
              transition: 'all 0.3s ease',
              opacity: isTransitioning ? 0.5 : 1,
              transform: isTransitioning ? 'translateY(10px)' : 'translateY(0)'
            }}
          >
            {/* Username field - only visible in register mode */}
            {mode === 'register' && (
              <div className="form-group" style={{
                animation: !isTransitioning ? 'fadeIn 0.4s ease forwards' : undefined
              }}>
                <label htmlFor="username" className="form-label">
                  Username
                </label>
                <input
                  type="text"
                  id="username"
                  name="username"
                  ref={usernameInputRef}
                  value={formData.username}
                  onChange={handleInputChange}
                  onBlur={handleInputBlur}
                  className={getFieldClassName('username')}
                  placeholder="Enter your username"
                  disabled={isLoading || isTransitioning}
                  autoComplete="username"
                />
                {getFieldError('username') && (
                  <div className="validation-message">{getFieldError('username')}</div>
                )}
              </div>
            )}

            {/* Email field - shared between both modes */}
            <div className="form-group">
              <label htmlFor="email" className="form-label">
                Email Address
              </label>
              <input
                type="email"
                id="email"
                name="email"
                ref={emailInputRef}
                value={formData.email}
                onChange={handleInputChange}
                onBlur={handleInputBlur}
                className={getFieldClassName('email')}
                placeholder="Enter your email"
                disabled={isLoading || isTransitioning}
                autoComplete="email"
              />
              {getFieldError('email') && (
                <div className="validation-message">{getFieldError('email')}</div>
              )}
            </div>

            {/* Password field - shared between both modes */}
            <div className="form-group">
              <label htmlFor="password" className="form-label">
                Password
              </label>
              <input
                type="password"
                id="password"
                name="password"
                ref={passwordInputRef}
                value={formData.password}
                onChange={handleInputChange}
                onBlur={handleInputBlur}
                className={getFieldClassName('password')}
                placeholder="Enter your password"
                disabled={isLoading || isTransitioning}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
              {mode === 'register' && !getFieldError('password') && (
                <div className="text-muted" style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
                  Password must be at least 8 characters with uppercase, lowercase, and number
                </div>
              )}
              {getFieldError('password') && (
                <div className="validation-message">{getFieldError('password')}</div>
              )}
            </div>

            {/* Confirm Password field - only visible in register mode */}
            {mode === 'register' && (
              <div className="form-group" style={{
                animation: !isTransitioning ? 'fadeIn 0.4s ease forwards' : undefined
              }}>
                <label htmlFor="confirmPassword" className="form-label">
                  Confirm Password
                </label>
                <input
                  type="password"
                  id="confirmPassword"
                  name="confirmPassword"
                  ref={confirmPasswordInputRef}
                  value={formData.confirmPassword}
                  onChange={handleInputChange}
                  onBlur={handleInputBlur}
                  className={getFieldClassName('confirmPassword')}
                  placeholder="Confirm your password"
                  disabled={isLoading || isTransitioning}
                  autoComplete="new-password"
                />
                {getFieldError('confirmPassword') && (
                  <div className="validation-message">{getFieldError('confirmPassword')}</div>
                )}
              </div>
            )}

            {/* Error Display */}
            {authError && (
              <div style={{
                padding: '1rem',
                marginBottom: '1rem',
                backgroundColor: 'rgba(244, 67, 54, 0.1)',
                border: '2px solid #f44336',
                borderRadius: '8px',
                color: '#f44336',
                fontSize: '0.95rem',
                fontWeight: '500',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.75rem',
                animation: 'slideDown 0.3s ease',
                position: 'relative'
              }}>
                <span style={{ fontSize: '1.2rem', marginTop: '0.1rem' }}>⚠️</span>
                <div style={{ flex: 1 }}>
                  <strong>{getDisplayErrorMessage(authError).title}:</strong>{' '}
                  {getDisplayErrorMessage(authError).message}
                </div>
                <button
                  type="button"
                  onClick={() => setAuthError(null)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#f44336',
                    cursor: 'pointer',
                    fontSize: '1.2rem',
                    padding: '0',
                    marginTop: '-0.25rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '24px',
                    height: '24px',
                    transition: 'transform 0.2s ease',
                    flexShrink: 0
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'scale(1.2)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'scale(1)';
                  }}
                >
                  ×
                </button>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              className="btn btn-primary btn-full"
              disabled={isLoading || isTransitioning}
            >
              {isLoading && <span className="spinner"></span>}
              {mode === 'login' ? 'Enter the Lair' : 'Join the Adventure'}
            </button>
          </form>
        </div>

        {/* Footer */}
        <div className="mt-lg text-center">
          <p className="text-muted">
            <em>"The dice await your first roll..."</em>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Auth;