import React, { useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { Image } from "expo-image";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { exerciseArt, type ExerciseArtAsset } from "@/src/data/exercise-art";
import { fold } from "@/src/constants";
import { useTheme } from "@/src/theme";

export function exerciseIllustration(name: string) { return exerciseArt[fold(name)]; }

function ArtPanel({ art, name, stage }: { art: ExerciseArtAsset; name: string; stage: number }) {
  const [width, setWidth] = useState(0);
  const split = stage >= 0 && art.stages === 2;
  const ratio = split ? art.aspectRatio / 2 : art.aspectRatio;
  return <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)} style={{ width: "100%", aspectRatio: ratio, overflow: "hidden", backgroundColor: "#10151E", borderRadius: 16 }}>
    <Image testID={`exercise-3d-${name}`} source={art.source} accessibilityLabel={`${name}: ilustração 3D${split ? `, posição ${stage + 1}` : ""}`} contentFit="contain" cachePolicy="memory-disk"
      style={split ? { position: "absolute", width: width * 2, height: "100%", left: stage === 0 ? 0 : -width } : { width: "100%", height: "100%" }} />
  </View>;
}

function StageButtons({ stages, stage, onChange }: { stages: number; stage: number; onChange: (value: number) => void }) {
  const { colors } = useTheme();
  if (stages < 2) return null;
  return <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
    {[{ label: "Visão completa", value: -1 }, { label: "Posição 1", value: 0 }, { label: "Posição 2", value: 1 }].map(({ label, value }) => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: stage === value }} onPress={() => onChange(value)} style={{ minHeight: 44, paddingHorizontal: 12, justifyContent: "center", borderRadius: 12, backgroundColor: stage === value ? colors.brandTertiary : colors.surfaceTertiary, borderWidth: 1, borderColor: stage === value ? colors.brandPrimary : "transparent" }}>
      <Text style={{ color: stage === value ? colors.brandPrimary : colors.onSurfaceSecondary, fontSize: 12, fontWeight: "600" }}>{label}</Text>
    </Pressable>)}
  </View>;
}

export function ExerciseIllustration({ name, art }: { name: string; art: ExerciseArtAsset }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [expanded, setExpanded] = useState(false);
  const [stage, setStage] = useState(-1);
  return <View style={{ gap: 10 }}>
    <View style={{ borderRadius: 20, backgroundColor: "#10151E", padding: 10, gap: 8, borderWidth: 1, borderColor: "#253349" }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <Text style={{ color: "#8DDCFA", fontSize: 11, fontWeight: "800", letterSpacing: 1 }}>GUIA 3D</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={`Ampliar ilustração de ${name}`} onPress={() => setExpanded(true)} style={{ minHeight: 44, minWidth: 88, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
          <Ionicons name="expand-outline" color="#E5EDF7" size={17} /><Text style={{ color: "#E5EDF7", fontSize: 12 }}>Ampliar</Text>
        </Pressable>
      </View>
      <ArtPanel art={art} name={name} stage={stage} />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 6 }}><View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#FF665D" }} /><Text style={{ color: "#CBD5E1", fontSize: 11, flex: 1 }}>Em vermelho: músculos em foco</Text></View>
    </View>
    <StageButtons stages={art.stages} stage={stage} onChange={setStage} />
    <Text style={{ color: colors.muted, fontSize: 11, lineHeight: 16 }}>O destaque indica os grupos em foco e não mede a ativação muscular.</Text>
    <Modal visible={expanded} animationType="fade" onRequestClose={() => setExpanded(false)}>
      <View style={{ flex: 1, backgroundColor: "#10151E", paddingTop: insets.top + 8, paddingBottom: insets.bottom + 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, gap: 12 }}>
          <Text style={{ color: "#F8FAFC", flex: 1, fontSize: 18, fontWeight: "700" }}>{name}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Fechar ilustração ampliada" onPress={() => setExpanded(false)} style={{ minHeight: 48, minWidth: 48, alignItems: "center", justifyContent: "center" }}><Ionicons name="close" size={26} color="#F8FAFC" /></Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16, alignItems: "center" }}>
          <View style={{ width: "100%", maxWidth: 760 }}><ArtPanel art={art} name={name} stage={stage} /></View>
          <StageButtons stages={art.stages} stage={stage} onChange={setStage} />
          <Text style={{ color: "#CBD5E1", fontSize: 12, lineHeight: 18 }}>Músculos em foco destacados em vermelho. {art.stages === 2 ? "Selecione uma posição para ver mais detalhes." : "Mantenha a posição indicada."}</Text>
        </ScrollView>
      </View>
    </Modal>
  </View>;
}