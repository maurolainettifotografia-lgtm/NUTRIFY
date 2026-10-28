import React, { useEffect, useRef, useState } from "react";
import { Alert, AppState, Linking, Platform, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as WebBrowser from "expo-web-browser";
import { latestStravaActivities } from "@/src/utils/strava";
import { apiFetch } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { Button, Card } from "@/src/components/primitives";
import { useToast } from "@/src/components/toast";
import { spacing, useTheme } from "@/src/theme";

type Status = { configured: boolean; connected: boolean; last_sync: string | null; sync_error: string | null };
type Activity = { activity_id: number; start_date?: string; name: string; sport_type: string; date: string; duration_min: number; distance_km: number; calories: number | null };

export function StravaPanel() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const qc = useQueryClient();
  const toast = useToast();
  const [connecting, setConnecting] = useState(false);
  const lastAuto = useRef(0);
  const status = useQuery<Status>({ queryKey: ["strava", user?.user_id, "status"], queryFn: () => apiFetch("/strava/status"), staleTime: 10000, refetchInterval: 30000, enabled: !!user });
  const activities = useQuery<{ results: Activity[] }>({ queryKey: ["strava", user?.user_id, "activities"], queryFn: () => apiFetch("/strava/activities"), enabled: !!status.data?.connected, refetchInterval: 30000 });
  const refresh = () => qc.invalidateQueries({ queryKey: ["strava", user?.user_id] });
  const { mutate: synchronize, isPending: syncing } = useMutation({
    mutationFn: () => apiFetch("/strava/sync", { method: "POST" }),
    onSuccess: refresh,
    onError: (e: Error) => toast.show(e.message || "Não foi possível sincronizar o Strava.", "error"),
  });
  const disconnect = useMutation({
    mutationFn: () => apiFetch("/strava/connection", { method: "DELETE" }),
    onSuccess: () => { qc.removeQueries({ queryKey: ["strava", user?.user_id, "activities"] }); refresh(); toast.show("Strava desconectado. Dados importados removidos."); },
    onError: (e: Error) => toast.show(e.message, "error"),
  });
  useEffect(() => {
    const auto = () => {
      if (AppState.currentState !== "active" || !status.data?.connected || syncing) return;
      const previous = status.data.last_sync ? Date.parse(status.data.last_sync) : 0;
      if (Date.now() - previous < 15 * 60000 || Date.now() - lastAuto.current < 15 * 60000) return;
      lastAuto.current = Date.now();
      synchronize();
    };
    auto();
    const timer = setInterval(auto, 60000);
    const listener = AppState.addEventListener("change", auto);
    return () => { clearInterval(timer); listener.remove(); };
  }, [status.data?.connected, status.data?.last_sync, synchronize, syncing]);
  const connect = async () => {
    setConnecting(true);
    try {
      const response = await apiFetch<{ url: string }>("/strava/connect", { method: "POST" });
      if (Platform.OS === "web") await Linking.openURL(response.url);
      else await WebBrowser.openAuthSessionAsync(response.url, "nutrify://strava");
      await refresh();
      lastAuto.current = 0;
    } catch (e) { toast.show(e instanceof Error ? e.message : "Não foi possível conectar o Strava.", "error"); }
    finally { setConnecting(false); }
  };
  const confirmDisconnect = () => {
    if (Platform.OS === "web") {
      if (globalThis.confirm("Desconectar o Strava e remover os dados importados do Nutrify?")) disconnect.mutate();
    } else Alert.alert("Desconectar Strava", "Os dados importados serão removidos do Nutrify. Os treinos originais continuarão no Strava.", [
      { text: "Cancelar", style: "cancel" }, { text: "Desconectar", style: "destructive", onPress: () => disconnect.mutate() },
    ]);
  };
  return <Card testID="strava-panel" style={{ gap: spacing.sm }}>
    <Text style={{ color: colors.onSurface, fontSize: 18, fontWeight: "700" }}>Gasto calórico dos seus treinos</Text>
    <Text style={{ color: colors.muted, fontSize: 12 }}>Compatible with Strava</Text>
    {status.isLoading ? <Text style={{ color: colors.muted }}>Verificando conexão…</Text> : status.isError ? <>
      <Text style={{ color: colors.error }}>Não foi possível consultar o Strava.</Text>
      <Button label="Tentar novamente" variant="secondary" onPress={() => status.refetch()} />
    </> : !status.data?.connected ? <>
      <Text style={{ color: colors.onSurfaceSecondary, lineHeight: 20 }}>Conecte sua conta para consultar nome, data, duração, distância e calorias dos treinos dos últimos 7 dias, incluindo atividades privadas se você autorizar. Ao desconectar, removemos os dados importados. Eles não são enviados à IA.</Text>
      {!status.data?.configured ? <Text testID="strava-setup-pending" style={{ color: colors.muted }}>Integração em preparação: falta concluir o cadastro do Nutrify no Strava.</Text> : null}
      <Button testID="strava-connect" label="Conectar ao Strava" onPress={connect} loading={connecting} disabled={!status.data?.configured} />
    </> : <>
      <Text style={{ color: colors.onSurfaceSecondary }}>Atualização automática a cada 15 minutos com o serviço ativo e ao abrir o app. A hospedagem gratuita pode atrasar a sincronização.</Text>
      <Text style={{ color: colors.muted, fontSize: 12 }}>3 treinos mais recentes · Última atualização: {status.data.last_sync ? new Date(status.data.last_sync).toLocaleString("pt-BR") : "aguardando primeira sincronização"}</Text>
      {status.data.sync_error ? <Text style={{ color: colors.error }}>{status.data.sync_error}</Text> : null}
      <Button testID="strava-sync" label="Sincronizar agora" variant="secondary" onPress={() => synchronize()} loading={syncing} />
      {activities.isLoading ? <Text style={{ color: colors.muted }}>Carregando atividades…</Text> : activities.isError ? <Text style={{ color: colors.error }}>Erro ao carregar atividades. Tente sincronizar novamente.</Text> : !activities.data?.results.length ? <Text style={{ color: colors.muted }}>Nenhuma atividade disponível nos últimos 7 dias.</Text> : latestStravaActivities(activities.data.results).map((a) => <View key={a.activity_id} testID={`strava-activity-${a.activity_id}`} style={{ borderTopWidth: 1, borderTopColor: colors.surfaceTertiary, paddingTop: spacing.md, gap: spacing.xs }}>
        <Text style={{ color: colors.onSurface, fontWeight: "700" }}>{a.name}</Text>
        <Text style={{ color: colors.onSurfaceSecondary }}>{a.date.split("-").reverse().join("/")} · {a.duration_min} min · {a.distance_km} km</Text>
        <Text style={{ color: colors.brandPrimary, fontWeight: "800", fontSize: 23 }}>{a.calories === null ? "Calorias não informadas" : `${a.calories.toLocaleString("pt-BR")} kcal`}</Text>
        <Text style={{ color: colors.muted, fontSize: 12 }}>Valor informado pelo Strava; não altera sua meta alimentar nesta etapa.</Text>
        <Text accessibilityRole="link" onPress={() => Linking.openURL(`https://www.strava.com/activities/${a.activity_id}`)} style={{ color: "#FC5200", fontWeight: "700", textDecorationLine: "underline" }}>View on Strava</Text>
      </View>)}
      <Button testID="strava-disconnect" label="Desconectar Strava" variant="ghost" loading={disconnect.isPending} onPress={confirmDisconnect} />
    </>}
  </Card>;
}
