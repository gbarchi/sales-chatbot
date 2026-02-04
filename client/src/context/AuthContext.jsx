import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

const API_BASE = process.env.REACT_APP_API_URL || '/api';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authEnabled, setAuthEnabled] = useState(true);

  // Check auth status and verify token on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        // First check if auth is enabled
        const statusRes = await fetch(`${API_BASE}/auth/status`);
        const statusData = await statusRes.json();
        setAuthEnabled(statusData.enabled);

        if (!statusData.enabled) {
          setLoading(false);
          return;
        }

        // Check for existing token
        const token = localStorage.getItem('authToken');
        if (token) {
          const verifyRes = await fetch(`${API_BASE}/auth/verify`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });

          if (verifyRes.ok) {
            const data = await verifyRes.json();
            if (data.success) {
              setUser(data.user);
            } else {
              localStorage.removeItem('authToken');
            }
          } else {
            localStorage.removeItem('authToken');
          }
        }
      } catch (error) {
        console.error('Auth check error:', error);
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, []);

  const login = async (username, password) => {
    try {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, password })
      });

      const data = await response.json();

      if (data.success) {
        localStorage.setItem('authToken', data.token);
        setUser(data.user);
        return { success: true };
      } else {
        return { success: false, message: data.message };
      }
    } catch (error) {
      return { success: false, message: 'Error de conexión' };
    }
  };

  const logout = async () => {
    try {
      const token = localStorage.getItem('authToken');
      await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      localStorage.removeItem('authToken');
      setUser(null);
    }
  };

  const getAuthHeader = () => {
    const token = localStorage.getItem('authToken');
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  };

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      authEnabled,
      login,
      logout,
      getAuthHeader,
      isAuthenticated: !authEnabled || !!user
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
