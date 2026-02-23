"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

const DAYS = [
  { key: "monday", label: "月曜日" },
  { key: "tuesday", label: "火曜日" },
  { key: "wednesday", label: "水曜日" },
  { key: "thursday", label: "木曜日" },
  { key: "friday", label: "金曜日" },
  { key: "saturday", label: "土曜日" },
  { key: "sunday", label: "日曜日" },
] as const;

interface Rule {
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  enabled: boolean;
}

export default function AvailabilityPage() {
  const { data: session } = useSession();
  const [timezone, setTimezone] = useState("Asia/Tokyo");
  const [rules, setRules] = useState<Rule[]>(
    DAYS.map((day) => ({
      dayOfWeek: day.key,
      startTime: "09:00",
      endTime: "17:00",
      enabled: ["monday", "tuesday", "wednesday", "thursday", "friday"].includes(
        day.key
      ),
    }))
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function loadSchedule() {
      try {
        const res = await fetch("/api/availability/schedule");
        if (res.ok) {
          const data = await res.json();
          if (data.timezone) setTimezone(data.timezone);
          if (data.rules && data.rules.length > 0) {
            setRules(
              DAYS.map((day) => {
                const existing = data.rules.find(
                  (r: { dayOfWeek: string }) => r.dayOfWeek === day.key
                );
                return {
                  dayOfWeek: day.key,
                  startTime: existing?.startTime || "09:00",
                  endTime: existing?.endTime || "17:00",
                  enabled: !!existing,
                };
              })
            );
          }
        }
      } catch {
        // Use defaults
      } finally {
        setLoading(false);
      }
    }
    loadSchedule();
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      const enabledRules = rules
        .filter((r) => r.enabled)
        .map(({ dayOfWeek, startTime, endTime }) => ({
          dayOfWeek,
          startTime,
          endTime,
        }));

      const res = await fetch("/api/availability", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timezone, rules: enabledRules }),
      });

      if (res.ok) {
        toast.success("空き時間設定を保存しました");
      } else {
        toast.error("保存に失敗しました");
      }
    } catch {
      toast.error("保存に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  function updateRule(index: number, field: string, value: string | boolean) {
    setRules((prev) =>
      prev.map((r, i) => (i === index ? { ...r, [field]: value } : r))
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-muted-foreground">読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">空き時間設定</h1>
        <p className="text-muted-foreground">
          対応可能な曜日と時間を設定してください
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">タイムゾーン</CardTitle>
        </CardHeader>
        <CardContent>
          <select
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="w-full p-2 border rounded-md text-sm"
          >
            <option value="Asia/Tokyo">Asia/Tokyo (JST)</option>
            <option value="America/New_York">America/New_York (EST)</option>
            <option value="America/Los_Angeles">America/Los_Angeles (PST)</option>
            <option value="Europe/London">Europe/London (GMT)</option>
            <option value="Europe/Berlin">Europe/Berlin (CET)</option>
            <option value="Asia/Shanghai">Asia/Shanghai (CST)</option>
            <option value="Asia/Singapore">Asia/Singapore (SGT)</option>
            <option value="Australia/Sydney">Australia/Sydney (AEST)</option>
          </select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">週間スケジュール</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {rules.map((rule, index) => {
            const day = DAYS.find((d) => d.key === rule.dayOfWeek)!;
            return (
              <div
                key={rule.dayOfWeek}
                className="flex items-center gap-4 py-2 border-b last:border-0"
              >
                <Switch
                  checked={rule.enabled}
                  onCheckedChange={(checked) =>
                    updateRule(index, "enabled", checked)
                  }
                />
                <span className="w-20 text-sm font-medium">{day.label}</span>
                {rule.enabled ? (
                  <div className="flex items-center gap-2">
                    <Input
                      type="time"
                      value={rule.startTime}
                      onChange={(e) =>
                        updateRule(index, "startTime", e.target.value)
                      }
                      className="w-32"
                    />
                    <span className="text-muted-foreground">-</span>
                    <Input
                      type="time"
                      value={rule.endTime}
                      onChange={(e) =>
                        updateRule(index, "endTime", e.target.value)
                      }
                      className="w-32"
                    />
                  </div>
                ) : (
                  <span className="text-sm text-muted-foreground">
                    対応不可
                  </span>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving} className="w-full">
        {saving ? "保存中..." : "保存"}
      </Button>
    </div>
  );
}
