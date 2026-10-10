import { useState } from "react";
import { View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

interface Point {
  t: number;
  balance: number;
}

/**
 * Balance sparkline: one line in the category tint with a faint area under it. No axes — the
 * card around it carries the numbers. Time is spaced by date, so gaps between deposits show.
 */
export function Sparkline({ points, color, height = 72, label }: { points: Point[]; color: string; height?: number; label: string }) {
  const [width, setWidth] = useState(0);
  const shapes = width > 0 && points.length > 1 ? build(points, width, height) : null;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}
      style={{ height, width: "100%" }}
    >
      {shapes ? (
        <Svg width={width} height={height}>
          <Path d={shapes.area} fill={color} fillOpacity={0.14} />
          <Path d={shapes.line} stroke={color} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
          <Circle cx={shapes.last.x} cy={shapes.last.y} r={4.5} fill={color} />
        </Svg>
      ) : null}
    </View>
  );
}

function build(points: Point[], width: number, height: number) {
  const pad = 6;
  const t0 = points[0].t;
  const t1 = points[points.length - 1].t;
  const span = Math.max(1, t1 - t0);
  const values = points.map((p) => p.balance);
  const lo = Math.min(0, ...values);
  const hi = Math.max(...values);
  const range = Math.max(1, hi - lo);
  const xy = points.map((p) => ({
    x: pad + ((p.t - t0) / span) * (width - pad * 2),
    y: pad + (1 - (p.balance - lo) / range) * (height - pad * 2),
  }));
  const line = xy.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const first = xy[0];
  const last = xy[xy.length - 1];
  const area = `${line} L${last.x.toFixed(1)},${height} L${first.x.toFixed(1)},${height} Z`;
  return { line, area, last };
}
