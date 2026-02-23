"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export default function NewEventPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: "",
    slug: "",
    description: "",
    durationMinutes: 30,
    meetingPlatform: "google_meet" as "google_meet" | "zoom" | "none",
    schedulingMode: "specific_person" as
      | "any_available"
      | "all_available"
      | "specific_person",
    color: "#6366f1",
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 0,
    minNoticeMinutes: 60,
    maxAdvanceDays: 60,
  });

  function generateSlug(title: string) {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function updateField(field: string, value: string | number) {
    setForm((prev) => {
      const updated = { ...prev, [field]: value };
      if (field === "title") {
        updated.slug = generateSlug(value as string);
      }
      return updated;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (res.ok) {
        toast.success("イベントタイプを作成しました");
        router.push("/events");
      } else {
        const data = await res.json();
        toast.error(data.error || "作成に失敗しました");
      }
    } catch {
      toast.error("作成に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">新しいイベントタイプ</h1>
        <p className="text-muted-foreground">
          予約可能なミーティングのテンプレートを作成します
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">基本情報</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="title">タイトル</Label>
              <Input
                id="title"
                value={form.title}
                onChange={(e) => updateField("title", e.target.value)}
                placeholder="例: 30分ミーティング"
                required
              />
            </div>
            <div>
              <Label htmlFor="slug">URL スラッグ</Label>
              <Input
                id="slug"
                value={form.slug}
                onChange={(e) => updateField("slug", e.target.value)}
                placeholder="例: 30min-meeting"
                required
              />
              <p className="text-xs text-muted-foreground mt-1">
                URLの一部として使用されます（英数字とハイフンのみ）
              </p>
            </div>
            <div>
              <Label htmlFor="description">説明（任意）</Label>
              <Textarea
                id="description"
                value={form.description}
                onChange={(e) => updateField("description", e.target.value)}
                placeholder="ミーティングの内容を説明してください"
                rows={3}
              />
            </div>
            <div>
              <Label htmlFor="duration">所要時間（分）</Label>
              <Select
                value={String(form.durationMinutes)}
                onValueChange={(v) =>
                  updateField("durationMinutes", parseInt(v))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="15">15分</SelectItem>
                  <SelectItem value="30">30分</SelectItem>
                  <SelectItem value="45">45分</SelectItem>
                  <SelectItem value="60">60分</SelectItem>
                  <SelectItem value="90">90分</SelectItem>
                  <SelectItem value="120">120分</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>色</Label>
              <div className="flex gap-2 mt-1">
                {[
                  "#6366f1",
                  "#8b5cf6",
                  "#ec4899",
                  "#ef4444",
                  "#f97316",
                  "#eab308",
                  "#22c55e",
                  "#06b6d4",
                ].map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`w-8 h-8 rounded-full border-2 ${
                      form.color === color
                        ? "border-foreground"
                        : "border-transparent"
                    }`}
                    style={{ backgroundColor: color }}
                    onClick={() => updateField("color", color)}
                  />
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">会議設定</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>会議プラットフォーム</Label>
              <Select
                value={form.meetingPlatform}
                onValueChange={(v) => updateField("meetingPlatform", v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="google_meet">Google Meet</SelectItem>
                  <SelectItem value="zoom">Zoom</SelectItem>
                  <SelectItem value="none">なし（対面・電話等）</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>スケジューリングモード</Label>
              <Select
                value={form.schedulingMode}
                onValueChange={(v) => updateField("schedulingMode", v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="specific_person">
                    指定メンバーの空き時間
                  </SelectItem>
                  <SelectItem value="any_available">
                    誰かが空いていればOK
                  </SelectItem>
                  <SelectItem value="all_available">
                    全員空いている時のみ
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                {form.schedulingMode === "specific_person" &&
                  "登録メンバーの空き時間だけを先方に提示します"}
                {form.schedulingMode === "any_available" &&
                  "メンバーの誰か1人でも空いていれば選択可能。予約時に自動割り当て。"}
                {form.schedulingMode === "all_available" &&
                  "全メンバーが空いている時間のみ選択可能。"}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">詳細設定</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>前後のバッファ（前・分）</Label>
                <Input
                  type="number"
                  value={form.bufferBeforeMinutes}
                  onChange={(e) =>
                    updateField("bufferBeforeMinutes", parseInt(e.target.value))
                  }
                  min={0}
                  max={120}
                />
              </div>
              <div>
                <Label>前後のバッファ（後・分）</Label>
                <Input
                  type="number"
                  value={form.bufferAfterMinutes}
                  onChange={(e) =>
                    updateField("bufferAfterMinutes", parseInt(e.target.value))
                  }
                  min={0}
                  max={120}
                />
              </div>
            </div>
            <div>
              <Label>最低通知時間（分）</Label>
              <Input
                type="number"
                value={form.minNoticeMinutes}
                onChange={(e) =>
                  updateField("minNoticeMinutes", parseInt(e.target.value))
                }
                min={0}
              />
              <p className="text-xs text-muted-foreground mt-1">
                現在時刻からこの時間以内のスロットは表示されません
              </p>
            </div>
            <div>
              <Label>最大予約可能日数</Label>
              <Input
                type="number"
                value={form.maxAdvanceDays}
                onChange={(e) =>
                  updateField("maxAdvanceDays", parseInt(e.target.value))
                }
                min={1}
                max={365}
              />
              <p className="text-xs text-muted-foreground mt-1">
                今日からこの日数以内のスロットのみ表示されます
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button type="submit" disabled={saving} className="flex-1">
            {saving ? "作成中..." : "イベントタイプを作成"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/events")}
          >
            キャンセル
          </Button>
        </div>
      </form>
    </div>
  );
}
