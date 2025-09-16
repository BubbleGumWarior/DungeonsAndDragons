import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireDM?: boolean;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, requireDM = false }) => {
  const { isAuthenticated, user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="auth-container">
        <div className="auth-card text-center">
          <div className="spinner" style={{ width: '40px', height: '40px', margin: '0 auto' }}></div>
          <p className="text-muted mt-lg">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    // Redirect to login page with return url
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (requireDM && user?.role !== 'Dungeon Master') {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <div className="alert alert-error">
            <h3>Access Denied</h3>
            <p>This area is restricted to Dungeon Masters only.</p>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default ProtectedRoute;