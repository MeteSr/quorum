import React, { useEffect, useState } from "react";
import {
  View, Text, FlatList, StyleSheet, SafeAreaView,
  RefreshControl, ActivityIndicator,
} from "react-native";
import { getAll, type Announcement } from "@/services/announcements";

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

function formatDate(ns: bigint): string {
  return new Date(Number(ns / BigInt(1_000_000))).toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  });
}

function AnnouncementCard({ item }: { item: Announcement }) {
  const isUrgent = "Urgent" in item.priority;
  return (
    <View style={[styles.card, isUrgent && styles.urgentCard]}>
      <View style={styles.cardHeader}>
        <Text style={[styles.cardTitle, isUrgent && styles.urgentTitle]}>{item.title}</Text>
        {isUrgent && <Text style={styles.urgentBadge}>URGENT</Text>}
      </View>
      <Text style={styles.cardBody}>{item.body}</Text>
      <Text style={styles.cardDate}>{formatDate(item.postedAt)}</Text>
    </View>
  );
}

export default function AnnouncementsScreen() {
  const [notices,    setNotices]    = useState<Announcement[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    const all = await getAll();
    // Show urgent first, then by most-recent.
    setNotices(
      [...all].sort((a, b) => {
        if (("Urgent" in a.priority) !== ("Urgent" in b.priority)) {
          return "Urgent" in a.priority ? -1 : 1;
        }
        return Number(b.postedAt - a.postedAt);
      })
    );
  }

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, []);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

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
        <Text style={styles.pageTitle}>Announcements</Text>
      </View>
      <FlatList
        data={notices}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <AnnouncementCard item={item} />}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>No announcements yet.</Text>}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: S.paper },
  center:      { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: S.paper },
  pageHeader:  { padding: 20, borderBottomWidth: 1, borderBottomColor: S.rule },
  pageTitle:   { fontFamily: S.serif, fontSize: 24, color: S.ink },
  list:        { padding: 16, paddingBottom: 32 },
  card:        { borderWidth: 1, borderColor: S.rule, padding: 16, marginBottom: 12 },
  urgentCard:  { borderColor: S.rust, borderLeftWidth: 4 },
  cardHeader:  { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 },
  cardTitle:   { fontFamily: S.serif,  fontSize: 16, color: S.ink, flex: 1 },
  urgentTitle: { color: S.rust },
  urgentBadge: { fontFamily: S.mono,   fontSize: 9, color: S.rust, letterSpacing: 1, marginLeft: 8, paddingTop: 2 },
  cardBody:    { fontFamily: S.sans,   fontSize: 13, color: S.inkLight, lineHeight: 19, marginBottom: 8 },
  cardDate:    { fontFamily: S.mono,   fontSize: 10, color: S.inkLight },
  empty:       { fontFamily: S.sans,   fontSize: 13, color: S.inkLight, textAlign: "center", marginTop: 40 },
});
