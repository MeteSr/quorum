import React, { useEffect, useState } from "react";
import {
  View, Text, FlatList, TouchableOpacity, Linking,
  StyleSheet, SafeAreaView, RefreshControl, ActivityIndicator, Alert,
} from "react-native";
import { getMyProfile } from "@/services/members";
import { getAssessmentsForUnit, createDuesCheckoutSession, type Assessment } from "@/services/treasury";

const S = {
  ink:      "#0E0E0C",
  paper:    "#F4F1EB",
  rust:     "#C94C2E",
  rule:     "#C8C3B8",
  inkLight: "#7A7268",
  serif:    "PlayfairDisplay_700Bold",
  mono:     "IBMPlexMono_400Regular",
  sans:     "IBMPlexSans_400Regular",
};

function centsToDisplay(cents: bigint): string {
  return (Number(cents) / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function formatDate(ns: bigint): string {
  return new Date(Number(ns / BigInt(1_000_000))).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

function kindLabel(kind: Assessment["kind"]): string {
  const k = Object.keys(kind)[0];
  const map: Record<string, string> = {
    MonthlyDues: "Monthly Dues", SpecialAssessment: "Special Assessment",
    Fine: "Fine", Amenity: "Amenity Fee", LateFee: "Late Fee",
  };
  return map[k] ?? k;
}

function statusLabel(status: Assessment["status"]): { label: string; color: string } {
  if ("Outstanding" in status) return { label: "DUE",     color: S.rust };
  if ("Paid"        in status) return { label: "PAID",    color: "#2E7D32" };
  if ("Waived"      in status) return { label: "WAIVED",  color: S.inkLight };
  return                               { label: "DISPUTE", color: "#E65100" };
}

export default function DuesScreen() {
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [paying,      setPaying]      = useState<string | null>(null);

  async function load() {
    const profile = await getMyProfile();
    if (!profile) return;
    const items = await getAssessmentsForUnit(profile.unitId);
    setAssessments(items.sort((a, b) => Number(b.dueDate - a.dueDate)));
  }

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, []);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function handlePay(assessment: Assessment) {
    setPaying(assessment.id);
    try {
      const result = await createDuesCheckoutSession(assessment.id);
      if ("ok" in result) {
        await Linking.openURL(result.ok.url);
      } else {
        Alert.alert("Error", "Could not start payment. Please try again.");
      }
    } catch {
      Alert.alert("Error", "Payment unavailable. Please try again.");
    } finally {
      setPaying(null);
    }
  }

  const totalOutstanding = assessments
    .filter((a) => "Outstanding" in a.status)
    .reduce((sum, a) => sum + a.amountCents, BigInt(0));

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator color={S.ink} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.pageHeader}>
        <Text style={styles.pageTitle}>Dues & Assessments</Text>
        {totalOutstanding > BigInt(0) && (
          <Text style={styles.totalOwed}>Owed: {centsToDisplay(totalOutstanding)}</Text>
        )}
      </View>

      <FlatList
        data={assessments}
        keyExtractor={(a) => a.id}
        renderItem={({ item }) => {
          const st = statusLabel(item.status);
          const isOutstanding = "Outstanding" in item.status;
          return (
            <View style={styles.card}>
              <View style={styles.cardTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.kindLabel}>{kindLabel(item.kind)}</Text>
                  <Text style={styles.description}>{item.description}</Text>
                  <Text style={styles.dueDate}>Due {formatDate(item.dueDate)}</Text>
                </View>
                <View style={styles.right}>
                  <Text style={styles.amount}>{centsToDisplay(item.amountCents)}</Text>
                  <Text style={[styles.statusBadge, { color: st.color }]}>{st.label}</Text>
                </View>
              </View>
              {isOutstanding && (
                <TouchableOpacity
                  style={[styles.payBtn, paying === item.id && styles.payBtnDisabled]}
                  onPress={() => handlePay(item)}
                  disabled={!!paying}
                >
                  {paying === item.id ? (
                    <ActivityIndicator color={S.paper} size="small" />
                  ) : (
                    <Text style={styles.payBtnText}>PAY NOW</Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
          );
        }}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>No assessments on file.</Text>}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: S.paper },
  center:         { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: S.paper },
  pageHeader:     { padding: 20, borderBottomWidth: 1, borderBottomColor: S.rule },
  pageTitle:      { fontFamily: S.serif,   fontSize: 24, color: S.ink },
  totalOwed:      { fontFamily: S.mono,    fontSize: 13, color: S.rust, marginTop: 4 },
  list:           { padding: 16, paddingBottom: 32 },
  card:           { borderWidth: 1, borderColor: S.rule, padding: 16, marginBottom: 12 },
  cardTop:        { flexDirection: "row" },
  kindLabel:      { fontFamily: S.mono,    fontSize: 10, color: S.inkLight, letterSpacing: 1, marginBottom: 4 },
  description:    { fontFamily: S.sans,    fontSize: 14, color: S.ink, marginBottom: 4 },
  dueDate:        { fontFamily: S.mono,    fontSize: 10, color: S.inkLight },
  right:          { alignItems: "flex-end", marginLeft: 12 },
  amount:         { fontFamily: S.serif,   fontSize: 18, color: S.ink },
  statusBadge:    { fontFamily: S.mono,    fontSize: 9,  letterSpacing: 1, marginTop: 4 },
  payBtn:         { backgroundColor: S.rust, marginTop: 12, paddingVertical: 12, alignItems: "center" },
  payBtnDisabled: { opacity: 0.5 },
  payBtnText:     { fontFamily: S.mono,    fontSize: 12, color: S.paper, letterSpacing: 1 },
  empty:          { fontFamily: S.sans,    fontSize: 13, color: S.inkLight, textAlign: "center", marginTop: 40 },
});
