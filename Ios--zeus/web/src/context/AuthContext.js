
import React, { createContext, useState, useEffect, useContext } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../services/api';

export const AuthContext = createContext();

export const useApp = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [userToken, setUserToken] = useState(null);
  const [userInfo, setUserInfo] = useState(null);
  const [loading, setLoading] = useState(true);

  // Load token from storage on startup
  useEffect(() => {
    const loadStorageData = async () => {
      try {
        const token = await AsyncStorage.getItem('userToken');
        const storedUser = await AsyncStorage.getItem('userInfo'); // Load cached user info

        if (token) {
          setUserToken(token);
          if (storedUser) {
             setUserInfo(JSON.parse(storedUser)); // Set cached user immediately
          }

          // Try to fetch fresh user details
          try {
             const response = await api.get('/api/user');
             setUserInfo(response.data.user);
             await AsyncStorage.setItem('userInfo', JSON.stringify(response.data.user)); // Cache fresh data
          } catch (e) {
             // 🔥 FIX: Only logout if explicit auth error (401/403), otherwise (Network Error) stay logged in
             if (e.response && (e.response.status === 401 || e.response.status === 403)) {
                 await logout();
             } else {
                 console.log('Network error or server down, staying logged in offline mode.');
             }
          }
        }
      } catch (e) {
        console.log('Failed to load token', e);
      } finally {
        setLoading(false);
      }
    };
    loadStorageData();
  }, []);

  const login = async (token) => {
    setLoading(true);
    try {
      await AsyncStorage.setItem('userToken', token);
      setUserToken(token);
      const response = await api.get('/api/user');
      setUserInfo(response.data.user);
      await AsyncStorage.setItem('userInfo', JSON.stringify(response.data.user));
    } catch (e) {
      console.log('Login error', e);
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    setLoading(true);
    try {
      await AsyncStorage.removeItem('userToken');
      await AsyncStorage.removeItem('userInfo');
      setUserToken(null);
      setUserInfo(null);
    } catch (e) {
      console.log('Logout error', e);
    } finally {
      setLoading(false);
    }
  };

  const getLastRead = async () => {
     // No-op here, HomeScreen fetches it directly for better sync
     return null; 
  };

  return (
    <AuthContext.Provider value={{ userToken, userInfo, login, logout, loading, getLastRead }}>
      {children}
    </AuthContext.Provider>
  );
};
