import React, { useState } from "react";
import { Text, View } from "react-native";
import Svg, { Circle, Line, Polyline, Rect, Text as SvgText } from "react-native-svg";
import { useTheme } from "@/src/theme";

type Point = { value: number; label: string };
/** Measures the actual card interior, including split-screen and resized web views. */
export function ResponsiveChart({ data, bars = false, height = 190 }: { data: Point[]; bars?: boolean; height?: number }) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const safe = data.filter(p => Number.isFinite(p.value));
  const left = 42, right = 12, top = 14, bottom = 30;
  const plotW = Math.max(0, width - left - right), plotH = height - top - bottom;
  const values = safe.map(p => p.value);
  const min = bars ? 0 : Math.max(0, Math.min(...values) - 1);
  const max = Math.max(min + 1, ...values) * (bars ? 1.08 : 1);
  const y = (v: number) => top + plotH * (1 - (v - min) / (max - min));
  const x = (i: number) => left + (bars ? (i + .5) * plotW / safe.length : i * plotW / Math.max(1, safe.length - 1));
  const labelEvery = Math.max(1, Math.ceil(safe.length / Math.max(2, Math.floor(plotW / 50))));
  return <View testID="responsive-chart" style={{ width: "100%", minWidth: 0 }} onLayout={e => setWidth(e.nativeEvent.layout.width)}>
    {width > 0 && safe.length > 0 ? <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} accessibilityLabel={safe.map(p => `${p.label}: ${p.value}`).join("; ")}>
      {[0, 1, 2, 3, 4].map(i => { const v = min + (max - min) * i / 4; return <React.Fragment key={i}><Line x1={left} x2={width-right} y1={y(v)} y2={y(v)} stroke={colors.border} /><SvgText x={left-6} y={y(v)+3} fill={colors.muted} textAnchor="end" fontSize={9}>{Math.round(v * 10) / 10}</SvgText></React.Fragment>; })}
      {bars ? safe.map((p,i) => { const bw = Math.max(1, plotW / safe.length * .65); return <Rect key={i} x={x(i)-bw/2} y={y(p.value)} width={bw} height={Math.max(0, y(0)-y(p.value))} rx={2} fill={colors.brandPrimary} />; }) : <><Polyline points={safe.map((p,i) => `${x(i)},${y(p.value)}`).join(" ")} fill="none" stroke={colors.brandPrimary} strokeWidth={3} />{safe.map((p,i)=><Circle key={i} cx={x(i)} cy={y(p.value)} r={3} fill={colors.brandPrimary} />)}</>}
      {safe.map((p,i) => i % labelEvery === 0 || i === safe.length-1 ? <SvgText key={i} x={x(i)} y={height-9} fill={colors.muted} textAnchor={i===safe.length-1 ? "end" : i===0 ? "start" : "middle"} fontSize={9}>{p.label}</SvgText> : null)}
    </Svg> : <Text style={{ color: colors.muted }}>Carregando gráfico…</Text>}
  </View>;
}
