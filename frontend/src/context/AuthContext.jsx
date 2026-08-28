import { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
import { jwtDecode } from 'jwt-decode';
import { API } from '../utils/api';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const role = localStorage.getItem('role');
    const name = localStorage.getItem('name');
    const assigned_constituency = localStorage.getItem('assigned_constituency');
    const assigned_region = localStorage.getItem('assigned_region');
    const assigned_mandal = localStorage.getItem('assigned_mandal');
    const id = localStorage.getItem('id');

    if (token && role) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      setUser({ token, role, name, assigned_region, assigned_constituency, assigned_mandal, id });
    }
    setLoading(false);
  }, []);

  const login = async (email, password) => {
    const response = await axios.post(`${API}/auth/login`, { email, password });
    const { token, role, name, assigned_region, assigned_constituency, assigned_mandal } = response.data;
    
    const decoded = jwtDecode(token);
    const id = decoded.id;

    localStorage.setItem('token', token);
    localStorage.setItem('role', role);
    localStorage.setItem('name', name || '');
    localStorage.setItem('assigned_constituency', assigned_constituency || '');
    localStorage.setItem('assigned_region', assigned_region || '');
    localStorage.setItem('assigned_mandal', assigned_mandal || '');
    localStorage.setItem('id', id);
    
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    setUser({ token, role, name, assigned_region, assigned_constituency, assigned_mandal, id });
    return response.data;
  };

  const logout = () => {
    localStorage.clear();
    delete axios.defaults.headers.common['Authorization'];
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};
