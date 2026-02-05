import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

const AuthContext = createContext(null);

const API_BASE = process.env.REACT_APP_API_URL || '/api';
const SESSION_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes in milliseconds

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authEnabled, setAuthEnabled] = useState(true);
  const lastActivityRef = useRef(Date.now());
  const timeoutCheckRef = useRef(null);

  // Check auth status and verify token on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        // First check if auth is enabled
        const statusRes = await fetch(`${API_BASE}/auth/status`, {
          credentials: 'include'  // SECURITY: Include cookies in request
        });
        const statusData = await statusRes.json();
        setAuthEnabled(statusData.enabled);

        if (!statusData.enabled) {
          setLoading(false);
          return;
        }

        // SECURITY: Verify session using HttpOnly cookie (no localStorage)
        const verifyRes = await fetch(`${API_BASE}/auth/verify`, {
          method: 'POST',
          credentials: 'include'  // SECURITY: Include cookies in request
        });

        if (verifyRes.ok) {
          const data = await verifyRes.json();
          if (data.success) {
            setUser(data.user);
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
        credentials: 'include',  // SECURITY: Allow server to set HttpOnly cookie
        body: JSON.stringify({ username, password })
      });

      const data = await response.json();

      if (data.success) {
        // SECURITY: Token is now in HttpOnly cookie, not in response
        setUser(data.user);
        return { success: true };
      } else {
        return { success: false, message: data.message };
      }
    } catch (error) {
      return { success: false, message: 'Error de conexión' };
    }
  };

  const logout = async (reason = null) => {
    // Clear timeout checker
    if (timeoutCheckRef.current) {
      clearInterval(timeoutCheckRef.current);
      timeoutCheckRef.current = null;
    }

    try {
      // SECURITY: Server will clear HttpOnly cookie
      await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        credentials: 'include'
      });
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setUser(null);

      // Show message if logged out due to inactivity (this is safe in localStorage)
      if (reason === 'timeout') {
        localStorage.setItem('logoutReason', 'timeout');
      }
    }
  };

  // Update last activity timestamp
  const updateActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);

  // Session timeout effect - only active when user is logged in
  useEffect(() => {
    if (!user || !authEnabled) return;

    // Reset activity on mount
    lastActivityRef.current = Date.now();

    // Activity event listeners
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
    events.forEach(event => {
      window.addEventListener(event, updateActivity);
    });

    // Check for timeout every 30 seconds
    timeoutCheckRef.current = setInterval(() => {
      const timeSinceActivity = Date.now() - lastActivityRef.current;
      if (timeSinceActivity >= SESSION_TIMEOUT_MS) {
        console.log('Session timeout - logging out due to inactivity');
        logout('timeout');
      }
    }, 30000);

    return () => {
      events.forEach(event => {
        window.removeEventListener(event, updateActivity);
      });
      if (timeoutCheckRef.current) {
        clearInterval(timeoutCheckRef.current);
      }
    };
  }, [user, authEnabled, updateActivity]);

  // SECURITY: No longer exposing getAuthHeader - cookies are automatic
  return (
    <AuthContext.Provider value={{
      user,
      loading,
      authEnabled,
      login,
      logout,
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
