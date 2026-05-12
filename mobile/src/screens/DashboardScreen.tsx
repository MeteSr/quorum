import React, { useEffect, useState } from "react";
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView, RefreshControl, ActivityIndicator,
} from "react-native";
import { useAuthStore } from "@/store/authStore";
import { getMyProfile, getCommunityProfile, type Member, type CommunityProfile } from "@/services/members";
import { getUrgent, getActive, type Announcement } from "@/services/announcements";
import { getOutstandingAssessments, type Assessment } from "@/services/treasury";
import { usePushNotifications } from "@/hooks/usePushNotifications";

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
  const dollars = Number(cents) / 100;
  return dollars.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function formatDate(ns: bigint): string {
  return new Date(Number(ns / BigInt(1_000_000))).toLocaleDateString("en-US", {
    month: "short", day: "numeric",
  });
}

export default function DashboardScreen() {
  const { isAuthenticated, logout } = useAuthStore();
  const [member,     setMember]     = useState<Member | null>(null);
  const [community,  setCommunity]  = useState<CommunityProfile | null>(null);
  const [urgent,     setUrgent]     = useState<Announcement[]>([]);
  const [notices,    setNotices]    = useState<Announcement[]>([]);
  const [dues,       setDues]       = useState<Assessment[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  usePushNotifications(isAuthenticated);

  async function load() {
    const [m, c, u, a, d] = await Promise.all([
      getMyProfile(),
      getCommunityProfile(),
      getUrgent(),
      getActive(),
      getOutstandingAssessments(),
    ]);
    setMember(m);
    setCommunity(c);
    setUrgent(u);
    setNotices(a.filter((n) => !("Urgent" in n.priority)).slice(0, 3));
    setDues(d.slice(0, 3));
  }

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, []);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const totalOwed = dues
    .filter((d) => "Outstanding" in d.status)
    .reduce((sum, d) => sum + d.amountCents, BigInt(0));

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator color={S.ink} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.communityName}>{community?.name ?? "Quorum"}</Text>
            <Text style={styles.unitLabel}>
              {member ? `Unit ${member.unitId} · ${member.displayName}` : ""}
            </Text>
          </View>
          <TouchableOpacity onPress={logout}>
            <Text style={styles.logoutText}>LOG OUT</Text>
          </TouchableOpacity>
        </View>

        {/* Dues balance strip */}
        {totalOwed > BigInt(0) && (
          <View style={styles.duesStrip}>
            <Text style={styles.duesLabel}>OUTSTANDING DUES</Text>
            <Text style={styles.duesAmount}>{centsToDisplay(totalOwed)}</Text>
          </View>
        )}

        {/* Urgent alerts */}
        {urgent.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>URGENT ALERTS</Text>
            {urgent.map((n) => (
              <View key={n.id} style={styles.urgentCard}>
                <Text style={styles.urgentTitle}>{n.title}</Text>
                <Text style={styles.cardBody} numberOfLines={2}>{n.body}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Recent notices */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>RECENT NOTICES</Text>
          {notices.length === 0 ? (
            <Text style={styles.empty}>No active announcements.</Text>
          ) : (
            notices.map((n) => (
              <View key={n.id} style={styles.card}>
                <Text style={styles.cardTitle}>{n.title}</Text>
                <Text style={styles.cardBody} numberOfLines={2}>{n.body}</Text>
                <Text style={styles.cardDate}>{formatDate(n.postedAt)}</Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:     { flex: 1, backgroundColor: S.paper },
  center:        { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: S.paper },
  scroll:        { paddingBottom: 32 },
  header:        { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", padding: 20, borderBottomWidth: 1, borderBottomColor: S.rule },
  communityName: { fontFamily: S.serif,    fontSize: 20, color: S.ink },
  unitLabel:     { fontFamily: S.mono,     fontSize: 11, color: S.inkLight, marginTop: 2 },
  logoutText:    { fontFamily: S.mono,     fontSize: 11, color: S.inkLight, letterSpacing: 0.5 },
  duesStrip:     { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: S.rust, paddingHorizontal: 20, paddingVertical: 12 },
  duesLabel:     { fontFamily: S.mono,     fontSize: 11, color: S.paper, letterSpacing: 1 },
  duesAmount:    { fontFamily: S.serif,    fontSize: 18, color: S.paper },
  section:       { padding: 20 },
  sectionTitle:  { fontFamily: S.mono,     fontSize: 10, color: S.inkLight, letterSpacing: 1.5, marginBottom: 12 },
  card:          { borderWidth: 1, borderColor: S.rule, padding: 14, marginBottom: 10 },
  urgentCard:    { borderWidth: 1, borderColor: S.rust, borderLeftWidth: 4, padding: 14, marginBottom: 10 },
  cardTitle:     { fontFamily: S.serif,    fontSize: 15, color: S.ink, marginBottom: 4 },
  urgentTitle:   { fontFamily: S.serif,    fontSize: 15, color: S.rust, marginBottom: 4 },
  cardBody:      { fontFamily: S.sans,     fontSize: 13, color: S.inkLight, lineHeight: 18 },
  cardDate:      { fontFamily: S.mono,     fontSize: 10, color: S.inkLight, marginTop: 6 },
  empty:         { fontFamily: S.sans,     fontSize: 13, color: S.inkLight },
});
