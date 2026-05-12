import React, { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { useAuthStore } from "@/store/authStore";
import AppNavigator from "@/navigation/AppNavigator";
import { useBiometricAuth } from "@/hooks/useBiometricAuth";

export default function App() {
  const { checkAuth, isAuthenticated } = useAuthStore();

  // Restore session on launch.
  useEffect(() => { checkAuth(); }, []);

  // Gate re-opens behind biometric once the user is logged in.
  useBiometricAuth(isAuthenticated);

  return (
    <>
      <StatusBar style="dark" />
      <AppNavigator />
    </>
  );
}
