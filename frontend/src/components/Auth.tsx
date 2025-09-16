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

  const formRef = useRef<HTMLFormElement>(null);

  // Clear errors when switching modes
  useEffect(() => {
    clearError();
    setValidationErrors({});
  }, [mode, clearError]);

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
    } catch (err) {
      // Error is handled by the context
    }
  };

  const getFieldError = (fieldName: keyof ValidationErrors): string => {
    return touchedFields[fieldName] ? (validationErrors[fieldName] || '') : '';
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
            {error && (
              <div className="alert alert-error">
                {error}
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