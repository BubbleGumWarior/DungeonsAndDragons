import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { CampaignProvider } from './contexts/CampaignContext';
import ProtectedRoute from './components/ProtectedRoute';
import Auth from './components/Auth';
import Dashboard from './components/Dashboard';
import CampaignView from './components/CampaignView';
import CharacterCreation from './components/CharacterCreation';
import './styles/theme.css';

function App() {
  return (
    <AuthProvider>
      <CampaignProvider>
        <Router>
          <div className="App">
            <Routes>
              <Route path="/login" element={<Auth initialMode="login" />} />
              <Route path="/register" element={<Auth initialMode="register" />} />
              <Route 
                path="/dashboard" 
                element={
                  <ProtectedRoute>
                    <Dashboard />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/campaign/:campaignName" 
                element={
                  <ProtectedRoute>
                    <CampaignView />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/campaign/:campaignName/create-character" 
                element={
                  <ProtectedRoute>
                    <CharacterCreation />
                  </ProtectedRoute>
                } 
              />
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </div>
        </Router>
      </CampaignProvider>
    </AuthProvider>
  );
}

export default App;
