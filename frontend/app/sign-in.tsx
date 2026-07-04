import React, { useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/src/auth-context";
import { colors, fonts, radius, spacing } from "@/src/theme";

type Stage = "options" | "phone" | "otp";

export default function SignIn() {
  const insets = useSafeAreaInsets();
  const { signInWithGoogle, sendPhoneOtp, verifyPhoneOtp } = useAuth();
  const [stage, setStage] = useState<Stage>("options");
  const [phone, setPhone] = useState("+91");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  const onGoogle = async () => {
    setError(null);
    setBusy(true);
    try {
      await signInWithGoogle();
    } catch (e: any) {
      setError(e?.message ?? "Google sign-in failed");
    } finally {
      setBusy(false);
    }
  };

  const onSend = async () => {
    setError(null);
    setBusy(true);
    try {
      const resp = await sendPhoneOtp(phone.trim());
      setHint(resp?.hint ?? null);
      setStage("otp");
    } catch (e: any) {
      setError(e?.message ?? "Couldn't send code");
    } finally {
      setBusy(false);
    }
  };

  const onVerify = async () => {
    setError(null);
    setBusy(true);
    try {
      await verifyPhoneOtp(phone.trim(), code.trim(), name.trim() || undefined);
    } catch (e: any) {
      setError(e?.message ?? "Verification failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen} testID="sign-in-screen">
      <LinearGradient
        colors={[colors.bananaLeafDark, colors.bananaLeaf]}
        style={[styles.hero, { paddingTop: insets.top + 40 }]}
      >
        <View style={styles.logoWrap}>
          <Ionicons name="leaf" size={38} color={colors.riceWhite} />
        </View>
        <Text style={styles.brand}>AmmiAI</Text>
        <Text style={styles.tagline}>உங்கள் தமிழ் சமையலறை உதவியாளர்</Text>
        <Text style={styles.taglineEn}>Your Tamil kitchen companion</Text>
      </LinearGradient>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.sheet}
      >
        <ScrollView
          contentContainerStyle={[styles.sheetInner, { paddingBottom: insets.bottom + spacing.xl }]}
          keyboardShouldPersistTaps="handled"
        >
          {stage === "options" && (
            <>
              <Text style={styles.h1}>Welcome</Text>
              <Text style={styles.h1Ta}>வணக்கம்</Text>
              <Text style={styles.hint}>Sign in to plan meals, manage your pantry and cut kitchen waste.</Text>

              <TouchableOpacity
                testID="sign-in-google-btn"
                style={styles.googleBtn}
                onPress={onGoogle}
                disabled={busy}
              >
                <Ionicons name="logo-google" size={18} color="#1a1a1a" />
                <Text style={styles.googleText}>Continue with Google</Text>
              </TouchableOpacity>

              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>or</Text>
                <View style={styles.dividerLine} />
              </View>

              <TouchableOpacity
                testID="sign-in-phone-btn"
                style={styles.phoneBtn}
                onPress={() => setStage("phone")}
                disabled={busy}
              >
                <Ionicons name="call-outline" size={18} color={colors.textOnPrimary} />
                <Text style={styles.phoneText}>Continue with Phone</Text>
              </TouchableOpacity>
            </>
          )}

          {stage === "phone" && (
            <>
              <Pressable onPress={() => setStage("options")} style={styles.back} testID="phone-back">
                <Ionicons name="chevron-back" size={20} color={colors.textPrimary} />
                <Text style={styles.backText}>Back</Text>
              </Pressable>
              <Text style={styles.h1}>Enter your phone</Text>
              <Text style={styles.hint}>We&apos;ll send a 6-digit code. (Demo: any 6-digit code works.)</Text>

              <TextInput
                testID="phone-input"
                style={styles.input}
                keyboardType="phone-pad"
                value={phone}
                onChangeText={setPhone}
                placeholder="+91 98765 43210"
                placeholderTextColor={colors.textMuted}
              />

              <TouchableOpacity
                testID="phone-send-btn"
                style={[styles.primaryBtn, busy && styles.btnDisabled]}
                onPress={() => {
                  Keyboard.dismiss();
                  onSend();
                }}
                disabled={busy}
              >
                {busy ? (
                  <ActivityIndicator color={colors.riceWhite} />
                ) : (
                  <Text style={styles.primaryBtnText}>Send code</Text>
                )}
              </TouchableOpacity>
            </>
          )}

          {stage === "otp" && (
            <>
              <Pressable onPress={() => setStage("phone")} style={styles.back} testID="otp-back">
                <Ionicons name="chevron-back" size={20} color={colors.textPrimary} />
                <Text style={styles.backText}>Back</Text>
              </Pressable>
              <Text style={styles.h1}>Enter the code</Text>
              <Text style={styles.hint}>Sent to {phone}. {hint ? `(${hint})` : ""}</Text>

              <TextInput
                testID="otp-input"
                style={[styles.input, styles.otpInput]}
                keyboardType="number-pad"
                value={code}
                onChangeText={(t) => setCode(t.replace(/[^0-9]/g, "").slice(0, 6))}
                placeholder="123456"
                placeholderTextColor={colors.textMuted}
                maxLength={6}
              />

              <TextInput
                testID="otp-name-input"
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Your name (optional)"
                placeholderTextColor={colors.textMuted}
              />

              <TouchableOpacity
                testID="otp-verify-btn"
                style={[styles.primaryBtn, (busy || code.length < 6) && styles.btnDisabled]}
                onPress={onVerify}
                disabled={busy || code.length < 6}
              >
                {busy ? (
                  <ActivityIndicator color={colors.riceWhite} />
                ) : (
                  <Text style={styles.primaryBtnText}>Verify & continue</Text>
                )}
              </TouchableOpacity>
            </>
          )}

          {error ? (
            <View style={styles.errorBanner} testID="sign-in-error">
              <Ionicons name="alert-circle" size={16} color={colors.chili} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bananaLeafDark },
  hero: {
    paddingHorizontal: spacing.l,
    paddingBottom: spacing.xxl,
    alignItems: "center",
  },
  logoWrap: {
    width: 68,
    height: 68,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.m,
  },
  brand: {
    color: colors.riceWhite,
    fontFamily: fonts.headingEn,
    fontSize: 40,
    lineHeight: 44,
  },
  tagline: {
    color: "#CDE2CF",
    fontFamily: fonts.bodyTa,
    fontSize: 16,
    marginTop: 4,
  },
  taglineEn: {
    color: "rgba(251,248,239,0.7)",
    fontSize: 12,
    marginTop: 2,
  },
  sheet: {
    flex: 1,
    backgroundColor: colors.riceWhite,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    marginTop: -20,
  },
  sheetInner: {
    padding: spacing.l,
  },
  h1: {
    fontFamily: fonts.headingEn,
    fontSize: 26,
    color: colors.textPrimary,
  },
  h1Ta: {
    fontFamily: fonts.bodyTa,
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 2,
  },
  hint: {
    color: colors.textSecondary,
    marginTop: spacing.s,
    marginBottom: spacing.l,
    lineHeight: 20,
  },
  googleBtn: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.m,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  googleText: {
    color: "#1a1a1a",
    fontWeight: "600",
    fontSize: 15,
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: spacing.l,
    gap: spacing.s,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { color: colors.textMuted, fontSize: 12 },
  phoneBtn: {
    backgroundColor: colors.bananaLeaf,
    borderRadius: radius.m,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  phoneText: {
    color: colors.textOnPrimary,
    fontWeight: "600",
    fontSize: 15,
  },
  back: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.m,
  },
  backText: { color: colors.textPrimary, fontWeight: "500" },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.m,
    paddingVertical: 14,
    paddingHorizontal: 14,
    fontSize: 16,
    color: colors.textPrimary,
    marginBottom: spacing.m,
  },
  otpInput: {
    letterSpacing: 6,
    fontFamily: fonts.headingEn,
    fontSize: 22,
    textAlign: "center",
  },
  primaryBtn: {
    backgroundColor: colors.bananaLeaf,
    paddingVertical: 14,
    borderRadius: radius.m,
    alignItems: "center",
  },
  primaryBtnText: {
    color: colors.textOnPrimary,
    fontWeight: "600",
    fontSize: 15,
  },
  btnDisabled: { opacity: 0.5 },
  errorBanner: {
    marginTop: spacing.m,
    backgroundColor: "#FBECE4",
    borderRadius: radius.m,
    padding: spacing.m,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  errorText: { color: colors.chili, flex: 1, fontSize: 13 },
});
