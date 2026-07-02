import { useState, useCallback } from "react";

const STORAGE_KEY = "fsos_auth";

export function useAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState(
    () => localStorage.getItem(STORAGE_KEY) === "true"
  );

  const login = useCallback((_email: string, _password: string) => {
    localStorage.setItem(STORAGE_KEY, "true");
    setIsAuthenticated(true);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setIsAuthenticated(false);
  }, []);

  return { isAuthenticated, login, logout };
}
