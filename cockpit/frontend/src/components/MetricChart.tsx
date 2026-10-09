import { useState, type ReactNode } from "react";
import { CartesianGrid, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card } from "./Card";
import { formatTimeTick, timeTicks } from "../lib/format";

export interface ChartRange {
  from: number;
  to: number;
}

interface Props<T extends { ts: number }> {
  title: string;
  data: T[];
  dataKey: keyof T & string;
  color: string;
  range: ChartRange;
  /** Fixed y-axis domain, e.g. [0, 100]. */
  yDomain: [number, number];
  yTick: (v: number) => string;
  valueLabel: (v: number) => string;
  seriesName: string;
  action?: ReactNode;
  /** Charts sharing a syncId show the tooltip and cursor for the same point together. */
  syncId?: string;
  onZoom: (range: ChartRange) => void;
}

/** One time-series line chart with round x-axis ticks and drag-to-zoom. */
export function MetricChart<T extends { ts: number }>({
  title, data, dataKey, color, range, yDomain, yTick, valueLabel, seriesName, action, syncId, onZoom,
}: Props<T>) {
  const [drag, setDrag] = useState<{ a: number; b: number } | null>(null);
  const span = range.to - range.from;
  const axis = timeTicks(range.from, range.to);

  function endDrag() {
    if (drag && drag.a !== drag.b) onZoom(drag.a < drag.b ? { from: drag.a, to: drag.b } : { from: drag.b, to: drag.a });
    setDrag(null);
  }

  return (
    <Card title={title} action={action}>
      <div className="h-64 select-none" data-testid={`chart-${dataKey}`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            syncId={syncId}
            margin={{ top: 4, right: 12, bottom: 0, left: 0 }}
            onMouseDown={(e) => typeof e?.activeLabel === "number" && setDrag({ a: e.activeLabel, b: e.activeLabel })}
            onMouseMove={(e) => drag && typeof e?.activeLabel === "number" && setDrag({ ...drag, b: e.activeLabel })}
            onMouseUp={endDrag}
            onMouseLeave={() => setDrag(null)}
          >
            <CartesianGrid stroke="var(--color-ck-border)" strokeDasharray="3 3" />
            <XAxis
              dataKey="ts"
              type="number"
              scale="time"
              domain={[range.from, range.to]}
              ticks={axis.ticks}
              interval={0}
              tickFormatter={(v: number) => formatTimeTick(v, axis.step, span)}
              stroke="var(--color-ck-muted)"
              fontSize={12}
              tickMargin={6}
            />
            <YAxis domain={yDomain} tickFormatter={yTick} stroke="var(--color-ck-muted)" fontSize={12} width={56} />
            <Tooltip
              contentStyle={{ background: "var(--color-ck-raised)", border: "1px solid var(--color-ck-border)", borderRadius: 12 }}
              labelFormatter={(v) => new Date(Number(v)).toLocaleString()}
              formatter={(v) => [valueLabel(Number(v)), seriesName]}
            />
            <Line type="monotone" dataKey={dataKey} stroke={color} dot={false} strokeWidth={2} isAnimationActive={false} />
            {drag && <ReferenceArea x1={drag.a} x2={drag.b} fill={color} fillOpacity={0.15} />}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
