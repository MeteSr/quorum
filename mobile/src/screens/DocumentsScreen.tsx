import React, { useEffect, useState } from "react";
import {
  View, Text, FlatList, TouchableOpacity, Alert,
  StyleSheet, SafeAreaView, RefreshControl, ActivityIndicator,
} from "react-native";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { getAllDocuments, getDocument, acknowledgeDocument, type Document } from "@/services/documents";

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

function categoryLabel(cat: Document["category"]): string {
  if ("GoverningDocuments" in cat) return "GOVERNING";
  if ("MeetingMinutes"     in cat) return "MINUTES";
  if ("FinancialReports"   in cat) return "FINANCIAL";
  if ("Notices"            in cat) return "NOTICE";
  if ("Contracts"          in cat) return "CONTRACT";
  return "OTHER";
}

function sizeLabel(bytes: bigint): string {
  const n = Number(bytes);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DocumentsScreen() {
  const [documents,  setDocuments]  = useState<Document[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);

  async function load() {
    setDocuments(await getAllDocuments());
  }

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, []);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function handleDownload(doc: Document) {
    setDownloading(doc.id);
    try {
      const full = await getDocument(doc.id);
      if (!full) throw new Error("Not found");

      // Write content blob to a temp file, then share.
      const uint8 = new Uint8Array(full.content as unknown as ArrayBuffer);
      const base64 = btoa(String.fromCharCode(...uint8));
      const ext    = doc.mimeType.includes("pdf") ? "pdf" : "bin";
      const path   = `${FileSystem.cacheDirectory}${doc.id}.${ext}`;
      await FileSystem.writeAsStringAsync(path, base64, { encoding: FileSystem.EncodingType.Base64 });

      await acknowledgeDocument(doc.id);

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(path, { mimeType: doc.mimeType });
      } else {
        Alert.alert("Saved", `Document saved to ${path}`);
      }
    } catch {
      Alert.alert("Error", "Failed to download document. Please try again.");
    } finally {
      setDownloading(null);
    }
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
        <Text style={styles.pageTitle}>Documents</Text>
      </View>
      <FlatList
        data={documents}
        keyExtractor={(d) => d.id}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.rowInfo}>
              <Text style={styles.categoryBadge}>{categoryLabel(item.category)}</Text>
              <Text style={styles.docTitle}>{item.title}</Text>
              <Text style={styles.docMeta}>{sizeLabel(item.sizeBytes)} · {item.mimeType}</Text>
            </View>
            <TouchableOpacity
              style={[styles.dlBtn, downloading === item.id && styles.dlBtnDisabled]}
              onPress={() => handleDownload(item)}
              disabled={!!downloading}
            >
              {downloading === item.id ? (
                <ActivityIndicator color={S.paper} size="small" />
              ) : (
                <Text style={styles.dlBtnText}>↓</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>No documents uploaded yet.</Text>}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:     { flex: 1, backgroundColor: S.paper },
  center:        { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: S.paper },
  pageHeader:    { padding: 20, borderBottomWidth: 1, borderBottomColor: S.rule },
  pageTitle:     { fontFamily: S.serif,    fontSize: 24, color: S.ink },
  list:          { padding: 16, paddingBottom: 32 },
  row:           { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: S.rule, padding: 14, marginBottom: 10 },
  rowInfo:       { flex: 1 },
  categoryBadge: { fontFamily: S.mono,     fontSize: 9,  color: S.inkLight, letterSpacing: 1, marginBottom: 4 },
  docTitle:      { fontFamily: S.sans,     fontSize: 14, color: S.ink, marginBottom: 2 },
  docMeta:       { fontFamily: S.mono,     fontSize: 10, color: S.inkLight },
  dlBtn:         { backgroundColor: S.ink, width: 36, height: 36, justifyContent: "center", alignItems: "center", marginLeft: 12 },
  dlBtnDisabled: { opacity: 0.4 },
  dlBtnText:     { fontFamily: S.mono,     fontSize: 18, color: S.paper },
  empty:         { fontFamily: S.sans,     fontSize: 13, color: S.inkLight, textAlign: "center", marginTop: 40 },
});
