import React, { useRef, useState } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, Text, View } from "react-native";
import { Image } from "expo-image";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import { apiFetch } from "@/src/api";
import { AiConsentGate } from "@/src/components/ai-consent-gate";
import { Button, Card } from "@/src/components/primitives";
import { useToast } from "@/src/components/toast";
import { MEALS, MEAL_LABELS, todayStr } from "@/src/constants";
import { useTheme } from "@/src/theme";

type AiFood = { name: string; grams: number; calories: number; protein: number; carbs: number; fat: number };
type Photo = { uri: string; base64: string };
function ScanInner() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ meal?: string; date?: string }>();
  const toast = useToast();
  const qc = useQueryClient();
  const cameraRef = useRef<CameraView>(null);
  const lock = useRef(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [camera, setCamera] = useState(false);
  const [ready, setReady] = useState(false);
  const [pictureSize, setPictureSize] = useState<string>();
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [results, setResults] = useState<AiFood[] | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [saved, setSaved] = useState<number[]>([]);
  const [saving, setSaving] = useState<number | null>(null);
  const [meal, setMeal] = useState(MEALS.some(m => m.key === params.meal) ? params.meal! : "almoco");
  const date = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : todayStr();
  const acceptPhoto = (value: { uri: string; base64?: string | null }) => {
    if (!value.base64) throw new Error("Não foi possível ler a foto. Escolha outra imagem.");
    if (value.base64.length > 4_000_000) throw new Error("A foto é muito grande. Escolha uma imagem menor, de até 3 MB.");
    setPhoto({ uri: value.uri, base64: value.base64 }); setCamera(false); setReady(false);
    setResults(null); setNote(""); setSaved([]); setError("");
  };
  const openCamera = async () => {
    setError("");
    try {
      const allowed = permission?.granted ? permission : await requestPermission();
      if (allowed.granted) { setReady(false); setCamera(true); }
      else setError("A câmera não foi permitida. Você ainda pode escolher uma foto da galeria.");
    } catch { setError("Não foi possível abrir a câmera. Tente a galeria."); }
  };
  const cameraReady = async () => {
    try {
      if (!pictureSize) {
        const sizes = await cameraRef.current?.getAvailablePictureSizesAsync();
        const ordered = (sizes ?? []).map(value => ({ value, pixels: value.split("x").reduce((a, b) => a * Number(b), 1) })).filter(s => s.pixels > 0).sort((a, b) => a.pixels - b.pixels);
        const candidates = ordered.filter(s => s.pixels <= 2_000_000);
        const best = candidates[candidates.length - 1] ?? ordered[0];
        if (best) setPictureSize(best.value);
      }
    } catch { /* Some devices do not expose supported sizes; use their default. */ }
    setReady(true);
  };
  const capture = async () => {
    if (!cameraRef.current || !ready || lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try {
      const value = await cameraRef.current.takePictureAsync({ base64: true, quality: 0.5 });
      if (value) acceptPhoto(value); else throw new Error("Não foi possível capturar a foto. Tente novamente.");
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível fotografar."); }
    finally { lock.current = false; setBusy(false); }
  };
  const pick = async () => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try {
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: "images", base64: true, quality: 0.5 });
      if (!res.canceled && res.assets[0]) acceptPhoto(res.assets[0]);
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível abrir a galeria."); }
    finally { lock.current = false; setBusy(false); }
  };
  const recognize = async () => {
    if (!photo || lock.current) return;
    lock.current = true; setAnalyzing(true); setError("");
    try {
      const data = await apiFetch<{ foods: AiFood[]; note: string }>("/ai/recognize", { method: "POST", body: { image_base64: photo.base64 } });
      setResults(data.foods); setNote(data.note); setSaved([]);
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível analisar a foto. Tente novamente."); }
    finally { lock.current = false; setAnalyzing(false); }
  };
  const addFood = async (f: AiFood, index: number) => {
    if (lock.current || saved.includes(index)) return;
    lock.current = true; setSaving(index);
    try {
      await apiFetch("/diary", { method: "POST", body: { date, meal, name: f.name, grams: f.grams, calories: f.calories / f.grams * 100, protein: f.protein / f.grams * 100, carbs: f.carbs / f.grams * 100, fat: f.fat / f.grams * 100, source: "ai" } });
      setSaved(old => [...old, index]); qc.invalidateQueries({ queryKey: ["diary", date] }); qc.invalidateQueries({ queryKey: ["reports"] });
      toast.show(`Adicionado ao ${MEAL_LABELS[meal]}`);
    } catch (e) { toast.show(e instanceof Error ? e.message : "Erro ao adicionar", "error"); }
    finally { lock.current = false; setSaving(null); }
  };
  const disabled = busy || analyzing || saving !== null;
  return <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
    <View style={{ flexDirection: "row", alignItems: "center", padding: 16, gap: 12 }}>
      <Pressable testID="close-scan" accessibilityRole="button" accessibilityLabel="Fechar câmera" disabled={disabled} onPress={() => router.canGoBack() ? router.back() : router.replace("/")} style={{ minHeight: 44, minWidth: 44, justifyContent: "center" }}><Ionicons name="close" size={26} color={colors.onSurface}/></Pressable>
      <Text style={{ color: colors.onSurface, fontSize: 20, fontWeight: "800", flex: 1 }}>Reconhecer por foto</Text>
    </View>
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: insets.bottom + 32 }} keyboardShouldPersistTaps="handled">
      {camera && permission?.granted && !photo ? <View style={{ gap: 12 }}>
        <View style={{ height: 340, borderRadius: 24, overflow: "hidden", backgroundColor: colors.surfaceSecondary }}><CameraView ref={cameraRef} style={{ flex: 1 }} facing="back" pictureSize={pictureSize} onCameraReady={cameraReady} onMountError={() => { setCamera(false); setReady(false); setError("A câmera não iniciou. Escolha uma imagem da galeria ou tente novamente."); }}/></View>
        <Button testID="capture-food" label={ready ? "Tirar foto" : "Preparando câmera…"} disabled={!ready || disabled} loading={busy} onPress={capture}/>
        <Button label="Cancelar câmera" variant="ghost" disabled={disabled} onPress={() => setCamera(false)}/>
      </View> : photo ? <View style={{ gap: 12 }}>
        <Image testID="selected-food-photo" source={{ uri: photo.uri }} style={{ width: "100%", height: 260, borderRadius: 24, backgroundColor: colors.surfaceSecondary }} contentFit="contain" accessibilityLabel="Foto do alimento selecionada"/>
        {results === null ? <><Text style={{ color: colors.muted, lineHeight: 20 }}>Confira a foto e toque em analisar. A IA estima os alimentos, porções, calorias e macros.</Text><Button testID="analyze-photo" label={analyzing ? "Analisando sua foto…" : error ? "Tentar analisar novamente" : "Analisar com IA"} loading={analyzing} disabled={disabled} onPress={recognize}/></> : null}
      </View> : !camera ? <Card style={{ alignItems: "center", gap: 16, paddingVertical: 28 }}>
        <View style={{ borderRadius: 24, padding: 22, backgroundColor: colors.brandTertiary }}><Ionicons name="camera-outline" size={48} color={colors.brandPrimary}/></View>
        <Text style={{ color: colors.onSurface, fontSize: 23, fontWeight: "800", textAlign: "center" }}>Sua refeição, em uma foto</Text>
        <Text style={{ color: colors.muted, textAlign: "center", lineHeight: 21 }}>Fotografe o prato inteiro, com boa iluminação. Você poderá conferir a estimativa antes de salvar.</Text>
        <Button testID="grant-camera" label="Fotografar alimento" disabled={disabled} onPress={openCamera}/>
        {permission && !permission.granted && !permission.canAskAgain ? <Button testID="open-settings" label="Abrir configurações da câmera" variant="ghost" onPress={() => Linking.openSettings()}/> : null}
      </Card> : null}
      {error ? <Text testID="photo-error" accessibilityRole="alert" style={{ color: colors.error, lineHeight: 21 }}>{error}</Text> : null}
      {analyzing ? <ActivityIndicator color={colors.brandPrimary}/> : null}
      {results !== null ? <>
        <Text style={{ color: colors.onSurface, fontSize: 20, fontWeight: "800" }}>{results.length ? "Alimentos identificados" : "Não identifiquei alimentos"}</Text>
        {note ? <Text style={{ color: colors.muted, lineHeight: 21 }}>{note}</Text> : null}
        {results.length ? <>
          <Text testID="scan-estimate-notice" style={{ color: colors.muted, fontSize: 12, lineHeight: 18 }}>Estimativas pela foto. Confira as porções e o preparo antes de adicionar ao diário.</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{MEALS.map(m => <Pressable key={m.key} testID={`scan-meal-${m.key}`} accessibilityRole="button" accessibilityState={{ selected: meal === m.key }} disabled={disabled || saved.length > 0} onPress={() => setMeal(m.key)} style={{ minHeight: 44, paddingHorizontal: 14, justifyContent: "center", borderRadius: 22, backgroundColor: meal === m.key ? colors.brandTertiary : colors.surfaceSecondary }}><Text style={{ color: meal === m.key ? colors.brandPrimary : colors.muted }}>{m.label}</Text></Pressable>)}</ScrollView>
          {results.map((f,i) => <Card key={i} testID={`ai-food-${i}`} style={{ gap: 10 }}>
            <Text style={{ color: colors.onSurface, fontSize: 17, fontWeight: "700" }}>{f.name}</Text>
            <Text style={{ color: colors.muted, lineHeight: 20 }}>~{Math.round(f.grams)} g · {Math.round(f.calories)} kcal{"\n"}P {Math.round(f.protein)} g · C {Math.round(f.carbs)} g · G {Math.round(f.fat)} g</Text>
            <Button testID={`ai-add-${i}`} label={saved.includes(i) ? "Adicionado ao diário" : `Adicionar ao ${MEAL_LABELS[meal]}`} disabled={disabled || saved.includes(i)} loading={saving === i} onPress={() => addFood(f,i)}/>
          </Card>)}
        </> : null}
      </> : null}
      <Button testID="gallery-btn" label={photo ? "Escolher outra foto da galeria" : "Escolher foto da galeria"} variant="secondary" disabled={disabled} loading={busy && !camera} onPress={pick}/>
      {photo ? <Button testID="scan-again" label="Tirar outra foto" variant="ghost" disabled={disabled} onPress={() => { setPhoto(null); setResults(null); setError(""); openCamera(); }}/> : null}
      <Text style={{ color: colors.muted, fontSize: 11, lineHeight: 17, textAlign: "center" }}>O reconhecimento depende da internet e da disponibilidade da IA. As quantidades são estimativas visuais.</Text>
    </ScrollView>
  </View>;
}
export default function Scan() { return <AiConsentGate><ScanInner/></AiConsentGate>; }