import React, { useRef, useState } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";

import { apiFetch } from "@/src/api";
import { Button } from "@/src/components/primitives";
import { useToast } from "@/src/components/toast";
import { MEALS, MEAL_LABELS, todayStr } from "@/src/constants";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

type AiFood = { name: string; grams: number; calories: number; protein: number; carbs: number; fat: number };

export default function Scan() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [results, setResults] = useState<AiFood[] | null>(null);
  const [note, setNote] = useState("");
  const [meal, setMeal] = useState("almoco");
  const [analyzing, setAnalyzing] = useState(false);
  const date = todayStr();

  const recognize = async (image_base64: string) => {
    setAnalyzing(true);
    setResults(null);
    try {
      const data = await apiFetch<{ foods: AiFood[]; note: string }>("/ai/recognize", {
        method: "POST",
        body: { image_base64 },
      });
      setResults(data.foods);
      setNote(data.note);
      if (!data.foods.length) toast.show(data.note || "Nenhum alimento identificado", "info");
    } catch {
      toast.show("Falha ao analisar a imagem", "error");
    } finally {
      setAnalyzing(false);
    }
  };

  const capture = async () => {
    if (!cameraRef.current) return;
    const photo = await cameraRef.current.takePictureAsync({ base64: true, quality: 0.4 });
    if (photo?.base64) recognize(photo.base64);
  };

  const pickFromGallery = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: "images", base64: true, quality: 0.4 });
    if (!res.canceled && res.assets[0]?.base64) recognize(res.assets[0].base64);
  };

  const addFood = async (f: AiFood) => {
    try {
      await apiFetch("/diary", {
        method: "POST",
        body: {
          date,
          meal,
          name: f.name,
          grams: f.grams || 100,
          calories: f.grams > 0 ? (f.calories / f.grams) * 100 : f.calories,
          protein: f.grams > 0 ? (f.protein / f.grams) * 100 : f.protein,
          carbs: f.grams > 0 ? (f.carbs / f.grams) * 100 : f.carbs,
          fat: f.grams > 0 ? (f.fat / f.grams) * 100 : f.fat,
          source: "ai",
        },
      });
      qc.invalidateQueries({ queryKey: ["diary", date] });
      toast.show(`Adicionado ao ${MEAL_LABELS[meal]}`);
    } catch {
      toast.show("Erro ao adicionar", "error");
    }
  };

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
      <Pressable testID="close-scan" onPress={() => router.back()} hitSlop={10}>
        <Ionicons name="close" size={26} color={colors.onSurface} />
      </Pressable>
      <Text style={styles.headerTitle}>Reconhecer por foto</Text>
      <View style={{ width: 26 }} />
    </View>
  );

  // Permission states
  if (!permission) {
    return (
      <View style={styles.container}>
        {header}
        <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: 40 }} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        {header}
        <View style={styles.permWrap}>
          <Ionicons name="camera-outline" size={54} color={colors.brandPrimary} />
          <Text style={styles.permTitle}>Usar a câmera</Text>
          <Text style={styles.permText}>Precisamos da câmera para fotografar e analisar seus alimentos com IA.</Text>
          {permission.canAskAgain ? (
            <Button testID="grant-camera" label="Permitir câmera" onPress={requestPermission} />
          ) : (
            <Button testID="open-settings" label="Abrir configurações" onPress={() => Linking.openSettings()} />
          )}
          <Pressable testID="use-gallery-instead" onPress={pickFromGallery} style={{ marginTop: spacing.md }}>
            <Text style={styles.galleryLink}>Ou escolher da galeria</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {header}

      {results ? (
        <ScrollView contentContainerStyle={[styles.resultsScroll, { paddingBottom: insets.bottom + 24 }]}>
          <Text style={styles.resultsTitle}>Alimentos identificados</Text>
          {note ? <Text style={styles.note}>{note}</Text> : null}

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow} style={styles.chipScroller}>
            {MEALS.map((m) => {
              const active = m.key === meal;
              return (
                <Pressable key={m.key} testID={`scan-meal-${m.key}`} onPress={() => setMeal(m.key)} style={[styles.chip, active && styles.chipActive]}>
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{m.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {results.map((f, i) => (
            <View key={i} style={styles.resultCard} testID={`ai-food-${i}`}>
              <View style={{ flex: 1 }}>
                <Text style={styles.resultName}>{f.name}</Text>
                <Text style={styles.resultSub}>
                  ~{Math.round(f.grams)} g · {Math.round(f.calories)} kcal · P {Math.round(f.protein)} C {Math.round(f.carbs)} G {Math.round(f.fat)}
                </Text>
              </View>
              <Pressable testID={`ai-add-${i}`} onPress={() => addFood(f)} style={styles.addBtn}>
                <Ionicons name="add" size={22} color={colors.onBrandPrimary} />
              </Pressable>
            </View>
          ))}

          <Button testID="scan-again" label="Analisar outra foto" variant="secondary" onPress={() => setResults(null)} style={{ marginTop: spacing.lg }} />
          <Text style={styles.disclaimer}>Valores estimados por IA. Revise antes de confiar nos números.</Text>
        </ScrollView>
      ) : (
        <View style={styles.cameraWrap}>
          <CameraView ref={cameraRef} style={styles.camera} facing="back" />
          <View style={[styles.focusBox, { pointerEvents: "none" }]} />
          {analyzing ? (
            <View style={styles.analyzing}>
              <ActivityIndicator color={colors.brandPrimary} size="large" />
              <Text style={styles.analyzingText}>Analisando com IA...</Text>
            </View>
          ) : (
            <View style={[styles.controls, { paddingBottom: insets.bottom + spacing.xl }]}>
              <Pressable testID="gallery-btn" onPress={pickFromGallery} style={styles.sideBtn}>
                <Ionicons name="images-outline" size={24} color={colors.onSurface} />
              </Pressable>
              <Pressable testID="capture-btn" onPress={capture} style={styles.shutter}>
                <View style={styles.shutterInner} />
              </Pressable>
              <View style={styles.sideBtn} />
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  headerTitle: { color: colors.onSurface, fontSize: 17, fontWeight: "700" },
  permWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: spacing.md },
  permTitle: { color: colors.onSurface, fontSize: 20, fontWeight: "800" },
  permText: { color: colors.muted, fontSize: 14, textAlign: "center", lineHeight: 20, marginBottom: spacing.md },
  galleryLink: { color: colors.brandPrimary, fontSize: 14, fontWeight: "600" },
  cameraWrap: { flex: 1, overflow: "hidden" },
  camera: { flex: 1 },
  focusBox: {
    position: "absolute",
    top: "22%",
    left: "12%",
    right: "12%",
    height: "45%",
    borderWidth: 2,
    borderColor: colors.brandPrimary,
    borderRadius: radius.lg,
  },
  analyzing: { position: "absolute", bottom: 0, left: 0, right: 0, top: 0, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(13,15,18,0.6)", gap: spacing.md },
  analyzingText: { color: colors.onSurface, fontSize: 15, fontWeight: "600" },
  controls: { position: "absolute", bottom: 0, left: 0, right: 0, flexDirection: "row", alignItems: "center", justifyContent: "space-around" },
  sideBtn: { width: 54, height: 54, borderRadius: 999, backgroundColor: "rgba(13,15,18,0.6)", alignItems: "center", justifyContent: "center" },
  shutter: { width: 74, height: 74, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.3)", alignItems: "center", justifyContent: "center" },
  shutterInner: { width: 60, height: 60, borderRadius: 999, backgroundColor: colors.brandPrimary },
  resultsScroll: { padding: spacing.lg, gap: spacing.md },
  resultsTitle: { color: colors.onSurface, fontSize: 20, fontWeight: "800" },
  note: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  chipScroller: { flexGrow: 0 },
  chipRow: { gap: spacing.sm, paddingVertical: spacing.sm },
  chip: { flexShrink: 0, height: 36, paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.brandTertiary, borderColor: colors.brandPrimary },
  chipText: { color: colors.muted, fontSize: 13, fontWeight: "600" },
  chipTextActive: { color: colors.brandPrimary },
  resultCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.lg },
  resultName: { color: colors.onSurface, fontSize: 15, fontWeight: "700" },
  resultSub: { color: colors.muted, fontSize: 12, marginTop: 4 },
  addBtn: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  disclaimer: { color: colors.muted, fontSize: 11, textAlign: "center", opacity: 0.7, marginTop: spacing.md },
}));
