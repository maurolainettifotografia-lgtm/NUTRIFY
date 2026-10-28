import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { fetch as expoFetch } from "expo/fetch";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import Ionicons from "@react-native-vector-icons/ionicons";

import { apiFetch, getAuthToken, BACKEND_URL } from "@/src/api";
import { AiConsentGate } from "@/src/components/ai-consent-gate";
import { useToast } from "@/src/components/toast";
import { todayStr } from "@/src/constants";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

type Msg = { id: string; role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "O que posso comer no jantar para bater minha meta de proteína?",
  "Quantas calorias ainda posso comer hoje?",
  "Sugira um café da manhã brasileiro saudável",
  "Como está minha alimentação hoje?",
];

const BASE = BACKEND_URL;

function AssistantInner() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const listRef = useRef<FlatList<Msg>>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);

  useEffect(() => {
    apiFetch<{ messages: Msg[] }>("/chat/messages")
      .then((r) => setMessages(r.messages))
      .catch(() => toast.show("Erro ao carregar conversa", "error"))
      .finally(() => setLoading(false));
  }, [toast]);

  const scrollToEnd = () => requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));

  const send = async (raw: string) => {
    const text = raw.trim();
    if (!text || streaming) return;
    setInput("");
    // eslint-disable-next-line react-hooks/purity -- Executado somente ao enviar uma mensagem.
    const timestamp = Date.now();
    const aiId = `ai-${timestamp}`;
    setMessages((m) => [...m, { id: `u-${timestamp}`, role: "user", content: text }, { id: aiId, role: "assistant", content: "" }]);
    setStreaming(true);
    scrollToEnd();

    const append = (delta: string) =>
      setMessages((m) => m.map((x) => (x.id === aiId ? { ...x, content: x.content + delta } : x)));

    try {
      const res = await expoFetch(`${BASE}/api/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getAuthToken()}` },
        body: JSON.stringify({ message: text, date: todayStr() }),
      });
      if (res.status === 429) {
        append("Você atingiu o limite diário de mensagens com a Nutri. Volte amanhã!");
        return;
      }
      if (!res.ok || !res.body) throw new Error("bad response");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const events = buf.split("\n\n");
        buf = events.pop() ?? "";
        for (const ev of events) {
          const line = ev.replace(/^data: /, "").trim();
          if (!line) continue;
          const data = JSON.parse(line);
          if (data.delta) {
            append(data.delta);
            scrollToEnd();
          } else if (data.error) {
            append(data.error);
          }
        }
      }
    } catch {
      append("Não foi possível responder agora. Verifique sua conexão e tente novamente.");
    } finally {
      setStreaming(false);
      scrollToEnd();
    }
  };

  const clear = async () => {
    await apiFetch("/chat/messages", { method: "DELETE" });
    setMessages([]);
    toast.show("Conversa apagada");
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.header}>
        <Pressable testID="close-assistant" onPress={() => router.back()} hitSlop={10} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
        </Pressable>
        <View style={styles.headerCenter}>
          <View style={styles.avatar}>
            <Ionicons name="sparkles" size={16} color={colors.onBrandPrimary} />
          </View>
          <View>
            <Text style={styles.headerTitle}>Nutri IA</Text>
            <Text style={styles.headerSub}>{streaming ? "digitando..." : "Assistente nutricional"}</Text>
          </View>
        </View>
        <Pressable testID="clear-chat" onPress={clear} hitSlop={10} style={styles.iconBtn} disabled={streaming || messages.length === 0}>
          <Ionicons name="trash-outline" size={20} color={messages.length ? colors.muted : "transparent"} />
        </Pressable>
      </View>

      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }} keyboardVerticalOffset={0}>
        {loading ? (
          <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: spacing["2xl"] }} />
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            contentContainerStyle={styles.list}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={scrollToEnd}
            renderItem={({ item }) => <Bubble msg={item} />}
            ListEmptyComponent={
              <View style={styles.empty} testID="chat-empty">
                <View style={styles.emptyIcon}>
                  <Ionicons name="sparkles" size={28} color={colors.brandPrimary} />
                </View>
                <Text style={styles.emptyTitle}>Olá! Eu sou a Nutri.</Text>
                <Text style={styles.emptySub}>Conheço suas metas e seu diário de hoje. Pergunte o que quiser sobre sua alimentação.</Text>
                <View style={styles.suggestions}>
                  {SUGGESTIONS.map((s, i) => (
                    <Pressable key={s} testID={`suggestion-${i}`} onPress={() => send(s)} style={styles.suggestion}>
                      <Text style={styles.suggestionText}>{s}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            }
          />
        )}

        <View style={[styles.composer, { paddingBottom: insets.bottom + spacing.sm }]}>
          <TextInput
            testID="chat-input"
            value={input}
            onChangeText={setInput}
            placeholder="Pergunte à Nutri..."
            placeholderTextColor={colors.muted}
            style={styles.input}
            multiline
            maxLength={1000}
          />
          <Pressable
            testID="chat-send"
            onPress={() => send(input)}
            disabled={!input.trim() || streaming}
            style={[styles.sendBtn, (!input.trim() || streaming) && { opacity: 0.4 }]}
          >
            {streaming ? <ActivityIndicator size="small" color={colors.onBrandPrimary} /> : <Ionicons name="arrow-up" size={20} color={colors.onBrandPrimary} />}
          </Pressable>
        </View>
        <Text style={styles.disclaimer}>A Nutri pode errar. Não substitui um nutricionista.</Text>
      </KeyboardAvoidingView>
    </View>
  );
}

function Bubble({ msg }: { msg: Msg }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const mine = msg.role === "user";
  return (
    <View style={[styles.bubble, mine ? styles.bubbleUser : styles.bubbleAi]} testID={`msg-${msg.role}`}>
      {msg.content ? (
        <Text style={[styles.bubbleText, mine && { color: colors.onBrandPrimary }]}>{msg.content}</Text>
      ) : (
        <ActivityIndicator size="small" color={colors.brandPrimary} />
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.md, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.divider },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headerCenter: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  avatar: { width: 32, height: 32, borderRadius: 999, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: colors.onSurface, fontSize: 16, fontWeight: "800" },
  headerSub: { color: colors.muted, fontSize: 12 },
  list: { padding: spacing.lg, gap: spacing.md, flexGrow: 1 },
  bubble: { maxWidth: "85%", borderRadius: radius.lg, paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
  bubbleUser: { alignSelf: "flex-end", backgroundColor: colors.brandPrimary, borderBottomRightRadius: 4 },
  bubbleAi: { alignSelf: "flex-start", backgroundColor: colors.surfaceSecondary, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: colors.border },
  bubbleText: { color: colors.onSurface, fontSize: 15, lineHeight: 22 },
  empty: { flex: 1, alignItems: "center", paddingTop: spacing["2xl"], gap: spacing.md },
  emptyIcon: { width: 64, height: 64, borderRadius: 999, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  emptyTitle: { color: colors.onSurface, fontSize: 20, fontWeight: "800" },
  emptySub: { color: colors.muted, fontSize: 14, textAlign: "center", lineHeight: 20, paddingHorizontal: spacing.lg },
  suggestions: { width: "100%", gap: spacing.sm, marginTop: spacing.md },
  suggestion: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, minHeight: 44, justifyContent: "center" },
  suggestionText: { color: colors.onSurfaceSecondary, fontSize: 14 },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider },
  input: { flex: 1, minHeight: 44, maxHeight: 120, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.lg, paddingTop: 12, paddingBottom: 12, color: colors.onSurface, fontSize: 15 },
  sendBtn: { width: 44, height: 44, borderRadius: 999, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  disclaimer: { color: colors.muted, fontSize: 10, textAlign: "center", opacity: 0.7, paddingBottom: spacing.xs },
}));

export default function Assistant() {
  return (
    <AiConsentGate>
      <AssistantInner />
    </AiConsentGate>
  );
}
