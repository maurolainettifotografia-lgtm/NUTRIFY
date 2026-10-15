import React from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";

import { apiFetch } from "@/src/api";
import { useWater } from "@/src/hooks";
import { Card } from "@/src/components/primitives";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

const QUICK = [200, 300, 500];

export function WaterWidget({ date }: { date: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const qc = useQueryClient();
  const { data } = useWater(date);

  const add = useMutation({
    mutationFn: (amount_ml: number) => apiFetch("/water", { method: "POST", body: { date, amount_ml } }),
    onSuccess: () => {
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      qc.invalidateQueries({ queryKey: ["water", date] });
    },
  });

  const total = data?.total_ml ?? 0;
  const goal = data?.goal_ml ?? 2500;
  const pct = Math.min(total / goal, 1);

  return (
    <Card testID="water-widget">
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Ionicons name="water" size={18} color={colors.info === "#4B5563" ? "#38BDF8" : colors.info} />
          <Text style={styles.title}>Hidratação</Text>
        </View>
        <Text style={styles.amount}>
          {total}
          <Text style={styles.goal}> / {goal} ml</Text>
        </Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct * 100}%` }]} />
      </View>
      <View style={styles.quickRow}>
        {QUICK.map((q) => (
          <Pressable
            key={q}
            testID={`water-add-${q}`}
            onPress={() => add.mutate(q)}
            style={({ pressed }) => [styles.quickBtn, pressed && { opacity: 0.7 }]}
          >
            <Ionicons name="add" size={14} color={colors.onSurfaceSecondary} />
            <Text style={styles.quickText}>{q} ml</Text>
          </Pressable>
        ))}
      </View>
    </Card>
  );
}

const useStyles = makeStyles((colors) => ({
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  titleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  title: { color: colors.onSurface, fontSize: 15, fontWeight: "700" },
  amount: { color: colors.onSurface, fontSize: 15, fontWeight: "700" },
  goal: { color: colors.muted, fontSize: 13, fontWeight: "500" },
  track: { height: 10, borderRadius: 999, backgroundColor: colors.surfaceTertiary, overflow: "hidden", marginTop: spacing.md },
  fill: { height: 10, borderRadius: 999, backgroundColor: "#38BDF8" },
  quickRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  quickBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    backgroundColor: colors.surfaceTertiary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
  },
  quickText: { color: colors.onSurfaceSecondary, fontSize: 13, fontWeight: "600" },
}));
