/**
 * LoginScreen — Internet Identity WebView auth flow.
 *
 * 1. Generate (or restore) a session Ed25519 key pair.
 * 2. Open a WebView pointing to the II endpoint.
 * 3. Inject a shim so II's window.opener.postMessage reaches React Native.
 * 4. Parse the delegation chain from the message and store it via authStore.
 */

import React, { useRef, useState, useEffect } from "react";
import {
  View, Text, TouchableOpacity, ActivityIndicator,
  StyleSheet, SafeAreaView,
} from "react-native";
import WebView, { WebViewMessageEvent } from "react-native-webview";
import { DelegationChain } from "@dfinity/identity";
import { getOrCreateSessionKey, II_URL } from "@/services/actor";
import { useAuthStore } from "@/store/authStore";

const S = {
  ink:   "#0E0E0C",
  paper: "#F4F1EB",
  rust:  "#C94C2E",
  rule:  "#C8C3B8",
  serif: "PlayfairDisplay_700Bold",
  mono:  "IBMPlexMono_400Regular",
  sans:  "IBMPlexSans_400Regular",
};

// Injected into the WebView so II's postMessage reaches React Native.
const INJECTED_JS = `
(function () {
  if (window.__rnBridgeInstalled) return;
  window.__rnBridgeInstalled = true;
  window.opener = {
    postMessage: function (msg, origin) {
      if (msg && msg.kind === 'authorize-client-success') {
        window.ReactNativeWebView.postMessage(JSON.stringify(msg));
      }
    }
  };
  window.close = function () {};
})();
true;
`;

export default function LoginScreen() {
  const { finishLogin } = useAuthStore();
  const [showWebView, setShowWebView] = useState(false);
  const [authUrl, setAuthUrl]         = useState<string | null>(null);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const webViewRef                    = useRef<WebView>(null);

  async function startLogin() {
    setError(null);
    setLoading(true);
    try {
      const sessionKey = await getOrCreateSessionKey();
      const pubkeyDer  = sessionKey.getPublicKey().toDer();
      const pubkeyHex  = Buffer.from(pubkeyDer).toString("hex");
      // II reads sessionPublicKey from the URL fragment to set up delegation.
      const url = `${II_URL}?sessionPublicKey=${pubkeyHex}&maxTimeToLive=${8 * 3_600_000_000_000}`;
      setAuthUrl(url);
      setShowWebView(true);
    } catch (e) {
      setError("Failed to initialize login. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleMessage(event: WebViewMessageEvent) {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.kind !== "authorize-client-success") return;
      const chain = DelegationChain.fromJSON(msg);
      await finishLogin(chain.toJSON() as object);
      setShowWebView(false);
    } catch (e) {
      setError("Login failed. Please try again.");
      setShowWebView(false);
    }
  }

  if (showWebView && authUrl) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: S.paper }}>
        <TouchableOpacity
          onPress={() => setShowWebView(false)}
          style={styles.cancelBtn}
        >
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
        <WebView
          ref={webViewRef}
          source={{ uri: authUrl }}
          injectedJavaScript={INJECTED_JS}
          onMessage={handleMessage}
          style={{ flex: 1 }}
          javaScriptEnabled
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.inner}>
        <Text style={styles.wordmark}>QUORUM</Text>
        <Text style={styles.tagline}>HOA management for modern boards</Text>

        {error && <Text style={styles.error}>{error}</Text>}

        <TouchableOpacity
          style={[styles.loginBtn, loading && styles.loginBtnDisabled]}
          onPress={startLogin}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={S.paper} />
          ) : (
            <Text style={styles.loginBtnText}>LOGIN WITH INTERNET IDENTITY</Text>
          )}
        </TouchableOpacity>

        <Text style={styles.note}>
          Internet Identity is a secure, password-free login provided by the
          Internet Computer. Your identity is never stored on Quorum servers.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: S.paper, justifyContent: "center" },
  inner:          { paddingHorizontal: 32 },
  wordmark:       { fontFamily: S.serif, fontSize: 36, color: S.ink, letterSpacing: 4, marginBottom: 8 },
  tagline:        { fontFamily: S.sans,  fontSize: 14, color: "#7A7268", marginBottom: 48 },
  loginBtn:       { backgroundColor: S.ink, paddingVertical: 16, alignItems: "center", marginBottom: 24 },
  loginBtnDisabled: { opacity: 0.5 },
  loginBtnText:   { fontFamily: S.mono,  fontSize: 12, color: S.paper, letterSpacing: 1 },
  note:           { fontFamily: S.sans,  fontSize: 12, color: "#7A7268", lineHeight: 18 },
  error:          { fontFamily: S.sans,  fontSize: 13, color: S.rust, marginBottom: 16 },
  cancelBtn:      { padding: 16 },
  cancelText:     { fontFamily: S.mono,  fontSize: 13, color: S.ink },
});
