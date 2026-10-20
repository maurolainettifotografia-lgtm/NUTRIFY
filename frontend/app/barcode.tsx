import React, { useRef, useState } from "react";
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import Ionicons from "@react-native-vector-icons/ionicons";

import { apiFetch } from "@/src/api";
import { Button } from "@/src/components/primitives";
import { useToast } from "@/src/components/toast";
import { MEALS, MEAL_LABELS, todayStr } from "@/src/constants";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

type Product = {
  code: string; name: string; brand?: string | null; calories: number; protein: number; carbs: number; fat: number;
  fiber?: number; sugars?: number; sodium?: number; serving?: string | null;
};

export default function Barcode() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const params = useLocalSearchParams<{ meal?: string; date?: string }>();
  const [permission, requestPermission] = useCameraPermissions();
  const [product, setProduct] = useState<Product | null>(null);
  const [looking, setLooking] = useState(false);
  const [manual, setManual] = useState("");
  const [grams, setGrams] = useState("100");
  const [meal, setMeal] = useState(params.meal ?? "almoco");
  const [saving, setSaving] = useState(false);
  const lock = useRef(false);
  const date = params.date ?? todayStr();

  const lookup = async (code: string) => {
    const clean = code.replace(/[^0-9]/g, "");
    if (lock.current || clean.length < 8) return;
    lock.current = true;
    setLooking(true);
    try {
      const p = await apiFetch<Product>(`/foods/barcode/${clean}`);
      setProduct(p);
      const serving = p.serving ? parseFloat(p.serving) : NaN;
      setGrams(Number.isFinite(serving) && serving > 0 ? String(Math.round(serving)) : "100");
    } catch {
      toast.show("Produto não encontrado. Tente buscar pelo nome.", "error");
      setTimeout(() => (lock.current = false), 1500);
    } finally {
      setLooking(false);
    }
  };

  const reset = () => {
    setProduct(null);
    setManual("");
    lock.current = false;
  };

  const add = async () => {
    if (!product) return;
    setSaving(true);
    try {
      await apiFetch("/diary", {
        method: "POST",
        body: {
          date, meal, name: product.name, brand: product.brand ?? null, grams: Number(grams) || 100,
          calories: product.calories, protein: product.protein, carbs: product.carbs, fat: product.fat,
          fiber: product.fiber ?? 0, sugars: product.sugars ?? 0, sodium: product.sodium ?? 0,
          source: "off", code: product.code,
        },
      });
      qc.invalidateQueries({ queryKey: ["diary", date] });
      toast.show(`Adicionado ao ${MEAL_LABELS[meal]}`);
      reset();
    } catch {
      toast.show("Erro ao adicionar", "error");
    } finally {
      setSaving(false);
    }
  };

  const factor = (Number(grams) || 0) / 100;

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
      <Pressable testID="close-barcode" onPress={() => router.back()} hitSlop={10} style={styles.iconBtn}>
        <Ionicons name="close" size={26} color={colors.onSurface} />
      </Pressable>
      <Text style={styles.headerTitle}>Código de barras</Text>
      <View style={styles.iconBtn} />
    </View>
  );

  const manualEntry = (
    <View style={styles.manualRow}>
      <TextInput
        testID="barcode-manual-input"
        value={manual}
        onChangeText={(t) => setManual(t.replace(/[^0-9]/g, ""))}
        placeholder="Digitar código (ex: 7891000100103)"
        placeholderTextColor={colors.muted}
        keyboardType="number-pad"
        maxLength={14}
        style={styles.manualInput}
      />
      <Pressable
        testID="barcode-manual-search"
        onPress={() => lookup(manual)}
        disabled={manual.length < 8 || looking}
        style={[styles.manualBtn, (manual.length < 8 || looking) && { opacity: 0.4 }]}
      >
        {looking ? <ActivityIndicator size="small" color={colors.onBrandPrimary} /> : <Ionicons name="search" size={20} color={colors.onBrandPrimary} />}
      </Pressable>
    </View>
  );

  if (product) {
    return (
      <View style={styles.container}>
        {header}
        <KeyboardAwareScrollView contentContainerStyle={[styles.resultScroll, { paddingBottom: insets.bottom + 24 }]} bottomOffset={20} keyboardShouldPersistTaps="handled">
          <View style={styles.productCard} testID="barcode-product">
            <Text style={styles.productName}>{product.name}</Text>
            <Text style={styles.productSub}>
              {product.brand ? `${product.brand} · ` : ""}{Math.round(product.calories)} kcal / 100g
            </Text>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow} style={{ flexGrow: 0 }}>
            {MEALS.map((m) => {
              const active = m.key === meal;
              return (
                <Pressable key={m.key} testID={`barcode-meal-${m.key}`} onPress={() => setMeal(m.key)} style={[styles.chip, active && styles.chipActive]}>
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{m.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.gramsRow}>
            <Text style={styles.gramsLabel}>Quantidade</Text>
            <View style={styles.gramsInputWrap}>
              <TextInput
                testID="barcode-grams"
                value={grams}
                onChangeText={(t) => setGrams(t.replace(/[^0-9]/g, ""))}
                keyboardType="number-pad"
                style={styles.gramsInput}
              />
              <Text style={styles.gramsUnit}>g</Text>
            </View>
          </View>

          <View style={styles.macroRow}>
            <Cell value={Math.round(product.calories * factor)} label="kcal" />
            <Cell value={Math.round(product.protein * factor)} label="Prot" />
            <Cell value={Math.round(product.carbs * factor)} label="Carb" />
            <Cell value={Math.round(product.fat * factor)} label="Gord" />
          </View>

          <Button testID="barcode-add" label={`Adicionar ao ${MEAL_LABELS[meal]}`} onPress={add} loading={saving} disabled={!Number(grams)} />
          <Button testID="barcode-scan-again" label="Escanear outro" variant="secondary" onPress={reset} />
        </KeyboardAwareScrollView>
      </View>
    );
  }

  const cameraAvailable = Platform.OS !== "web" && permission?.granted;

  return (
    <View style={styles.container}>
      {header}
      {cameraAvailable ? (
        <View style={styles.cameraWrap}>
          <CameraView
            style={styles.camera}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e"] }}
            onBarcodeScanned={looking ? undefined : ({ data }) => lookup(data)}
          />
          <View style={[styles.frame, { pointerEvents: "none" }]} />
          <Text style={[styles.hint, { pointerEvents: "none" }]}>Aponte para o código de barras da embalagem</Text>
          {looking ? (
            <View style={styles.overlay}>
              <ActivityIndicator color={colors.brandPrimary} size="large" />
              <Text style={styles.overlayText}>Buscando produto...</Text>
            </View>
          ) : null}
          <View style={[styles.bottomManual, { paddingBottom: insets.bottom + spacing.md }]}>{manualEntry}</View>
        </View>
      ) : (
        <KeyboardAwareScrollView contentContainerStyle={styles.permWrap} bottomOffset={20} keyboardShouldPersistTaps="handled">
          <Ionicons name="barcode-outline" size={56} color={colors.brandPrimary} />
          <Text style={styles.permTitle}>Escanear produtos</Text>
          <Text style={styles.permText}>
            {Platform.OS === "web"
              ? "A leitura pela câmera funciona no app do celular. Aqui você pode digitar o código de barras."
              : "Use a câmera para ler o código de barras e adicionar produtos embalados em segundos."}
          </Text>
          {Platform.OS !== "web" && permission && !permission.granted ? (
            permission.canAskAgain ? (
              <Button testID="barcode-grant-camera" label="Permitir câmera" onPress={requestPermission} />
            ) : (
              <Button testID="barcode-open-settings" label="Abrir configurações" onPress={() => Linking.openSettings()} />
            )
          ) : null}
          <Text style={styles.or}>ou digite o código</Text>
          {manualEntry}
        </KeyboardAwareScrollView>
      )}
    </View>
  );
}

function Cell({ value, label }: { value: number; label: string }) {
  const styles = useStyles();
  return (
    <View style={styles.cell}>
      <Text style={styles.cellValue}>{value}</Text>
      <Text style={styles.cellLabel}>{label}</Text>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: colors.onSurface, fontSize: 17, fontWeight: "700" },
  cameraWrap: { flex: 1, overflow: "hidden" },
  camera: { flex: 1 },
  frame: { position: "absolute", top: "28%", left: "10%", right: "10%", height: 160, borderWidth: 2, borderColor: colors.brandPrimary, borderRadius: radius.lg },
  hint: { position: "absolute", top: "22%", left: 0, right: 0, textAlign: "center", color: "#FFFFFF", fontSize: 14, fontWeight: "600" },
  overlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center", gap: spacing.md, backgroundColor: "rgba(13,15,18,0.6)" },
  overlayText: { color: "#FFFFFF", fontSize: 15, fontWeight: "600" },
  bottomManual: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: spacing.lg, paddingTop: spacing.md, backgroundColor: "rgba(13,15,18,0.75)" },
  permWrap: { flexGrow: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: spacing.md },
  permTitle: { color: colors.onSurface, fontSize: 20, fontWeight: "800" },
  permText: { color: colors.muted, fontSize: 14, textAlign: "center", lineHeight: 20, marginBottom: spacing.sm },
  or: { color: colors.muted, fontSize: 13, marginTop: spacing.md },
  manualRow: { flexDirection: "row", gap: spacing.sm, width: "100%" },
  manualInput: { flex: 1, minHeight: 48, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.lg, color: colors.onSurface, fontSize: 15 },
  manualBtn: { width: 48, height: 48, borderRadius: radius.md, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  resultScroll: { padding: spacing.lg, gap: spacing.lg },
  productCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, gap: 4 },
  productName: { color: colors.onSurface, fontSize: 18, fontWeight: "800" },
  productSub: { color: colors.muted, fontSize: 13 },
  chipRow: { gap: spacing.sm, paddingVertical: spacing.xs },
  chip: { flexShrink: 0, height: 36, paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.brandTertiary, borderColor: colors.brandPrimary },
  chipText: { color: colors.muted, fontSize: 13, fontWeight: "600" },
  chipTextActive: { color: colors.brandPrimary },
  gramsRow: { gap: spacing.sm },
  gramsLabel: { color: colors.onSurfaceSecondary, fontSize: 14, fontWeight: "600" },
  gramsInputWrap: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.lg },
  gramsInput: { flex: 1, color: colors.onSurface, fontSize: 20, fontWeight: "700", paddingVertical: spacing.md },
  gramsUnit: { color: colors.muted, fontSize: 16, fontWeight: "600" },
  macroRow: { flexDirection: "row", gap: spacing.sm },
  cell: { flex: 1, alignItems: "center", backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, paddingVertical: spacing.md },
  cellValue: { color: colors.onSurface, fontSize: 18, fontWeight: "800" },
  cellLabel: { color: colors.muted, fontSize: 11 },
}));
