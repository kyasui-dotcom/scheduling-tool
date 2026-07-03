"use client";

import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type Day =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export interface BusinessHour {
  dayOfWeek: Day;
  startTime: string; // HH:MM
  endTime: string;
}

const DAY_LABELS: { key: Day; label: string }[] = [
  { key: "monday", label: "月曜日" },
  { key: "tuesday", label: "火曜日" },
  { key: "wednesday", label: "水曜日" },
  { key: "thursday", label: "木曜日" },
  { key: "friday", label: "金曜日" },
  { key: "saturday", label: "土曜日" },
  { key: "sunday", label: "日曜日" },
];

interface Props {
  value: BusinessHour[] | null;
  onChange: (v: BusinessHour[] | null) => void;
}

/**
 * Editor for per-event business hours.
 * value === null means "use user's default schedule"
 * value === [] means "no hours (event always unavailable)"
 * value === [...items] means "override with these hours"
 */
export function BusinessHoursEditor({ value, onChange }: Props) {
  const isOverride = value !== null;

  if (!isOverride) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">
          このイベントはユーザーの「空き時間設定」に従って予約可能になります。
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            onChange(
              (["monday", "tuesday", "wednesday", "thursday", "friday"] as Day[]).map(
                (d) => ({
                  dayOfWeek: d,
                  startTime: "09:00",
                  endTime: "17:00",
                })
              )
            )
          }
        >
          このイベントだけ個別に営業日時を設定する
        </Button>
      </div>
    );
  }

  const byDay = new Map<Day, BusinessHour>();
  for (const bh of value || []) byDay.set(bh.dayOfWeek, bh);

  function update(day: Day, patch: Partial<BusinessHour>) {
    const next: BusinessHour[] = DAY_LABELS.map((d) => {
      const existing = byDay.get(d.key);
      if (d.key === day) {
        if (patch.startTime === "" || patch.endTime === "") {
          return null;
        }
        return {
          dayOfWeek: d.key,
          startTime: patch.startTime ?? existing?.startTime ?? "09:00",
          endTime: patch.endTime ?? existing?.endTime ?? "17:00",
        };
      }
      return existing || null;
    }).filter((x): x is BusinessHour => x !== null);
    onChange(next);
  }

  function toggle(day: Day, enabled: boolean) {
    const next: BusinessHour[] = DAY_LABELS.map((d) => {
      if (d.key === day) {
        return enabled
          ? byDay.get(d.key) || {
              dayOfWeek: d.key,
              startTime: "09:00",
              endTime: "17:00",
            }
          : null;
      }
      return byDay.get(d.key) || null;
    }).filter((x): x is BusinessHour => x !== null);
    onChange(next);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <p className="text-xs text-muted-foreground">
          このイベント専用の営業日時。有効にした曜日のみ予約可能になります。
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onChange(null)}
        >
          個別設定を解除（ユーザーの空き時間設定に戻す）
        </Button>
      </div>

      <div className="space-y-2">
        {DAY_LABELS.map(({ key, label }) => {
          const bh = byDay.get(key);
          const enabled = !!bh;
          return (
            <div
              key={key}
              className="flex items-center gap-3 py-1 border-b last:border-0"
            >
              <Switch
                checked={enabled}
                onCheckedChange={(v) => toggle(key, v)}
              />
              <span className="w-16 text-sm font-medium">{label}</span>
              {enabled ? (
                <div className="flex items-center gap-2">
                  <Input
                    type="time"
                    value={bh!.startTime}
                    onChange={(e) => update(key, { startTime: e.target.value })}
                    className="w-28"
                  />
                  <span className="text-muted-foreground">-</span>
                  <Input
                    type="time"
                    value={bh!.endTime}
                    onChange={(e) => update(key, { endTime: e.target.value })}
                    className="w-28"
                  />
                </div>
              ) : (
                <span className="text-xs text-muted-foreground">
                  この曜日は予約不可
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
