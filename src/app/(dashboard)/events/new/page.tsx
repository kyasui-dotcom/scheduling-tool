"use client";

import { useState, useEffect } from "react";
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
import { MemberPicker } from "@/components/member-picker";
import { AvailabilityPreview } from "@/components/availability-preview";
import { CustomQuestionEditor } from "@/components/custom-question-editor";
import type { CustomQuestion } from "@/lib/validations/event";
import { toast } from "sonner";

interface Member {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  username: string | null;
}

export default function NewEventPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [selectedMembers, setSelectedMembers] = useState<Member[]>([]);
  const [me, setMe] = useState<Member | null>(null);
  const [owner, setOwner] = useState<Member | null>(null);
  const [sameDomainUsers, setSameDomainUsers] = useState<Member[]>([]);
  const [customQuestions, setCustomQuestions] = useState<CustomQuestion[]>([]);

  useEffect(() => {
    fetch("/api/users/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((u) => {
        if (u) {
          setMe(u);
          setOwner(u);
        }
      })
      .catch(() => {});
    fetch("/api/users/same-domain")
      .then((r) => (r.ok ? r.json() : []))
      .then((arr) => setSameDomainUsers(arr || []))
      .catch(() => {});
  }, []);
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
    slotMode: "fixed_slots" as "fixed_slots" | "flexible_start",
    calendarTitleFormat: "title_first" as
      | "title_first"
      | "company_first"
      | "company_only",
    color: "#6366f1",
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 0,
    minNoticeMinutes: 60,
    maxAdvanceDays: 60,
    bookingWindowStart: "" as string,
    bookingWindowEnd: "" as string,
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
      const payload = {
        ...form,
        bookingWindowStart: form.bookingWindowStart || null,
        bookingWindowEnd: form.bookingWindowEnd || null,
        ownerUserId: owner && me && owner.id !== me.id ? owner.id : undefined,
        memberUserIds: selectedMembers.map((m) => m.id),
        customQuestions: customQuestions.length > 0 ? customQuestions : undefined,
      };

      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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
            {sameDomainUsers.length > 1 && (
              <div>
                <Label>オーナー（カレンダー所有者）</Label>
                <Select
                  value={owner?.id || ""}
                  onValueChange={(v) => {
                    const u = sameDomainUsers.find((u) => u.id === v) || me;
                    setOwner(u);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {sameDomainUsers.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name || u.email}
                        {me && u.id === me.id ? "（自分）" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  予約はオーナーのGoogleカレンダーに作成されます。同じメールドメインのユーザーを選択できます。
                </p>
              </div>
            )}
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
              <Label>時間選択方式</Label>
              <Select
                value={form.slotMode}
                onValueChange={(v) => updateField("slotMode", v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixed_slots">
                    固定スロットから選ぶ
                  </SelectItem>
                  <SelectItem value="flexible_start">
                    開始時刻を自由に選ぶ
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                {form.slotMode === "fixed_slots" &&
                  `${form.durationMinutes}分刻みの固定スロットから先方が選択します`}
                {form.slotMode === "flexible_start" &&
                  "空き時間帯の中から先方が15分刻みで開始時刻を選択します（所要時間ぶん予約）"}
              </p>
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
                  "あなたの空き時間だけを先方に提示します（1人用）"}
                {form.schedulingMode === "any_available" &&
                  "メンバーの誰か1人でも空いていれば選択可能。予約時に自動割り当て。"}
                {form.schedulingMode === "all_available" &&
                  "全メンバーが空いている時間のみ選択可能。"}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Team Members Card - only shown for multi-person modes */}
        {form.schedulingMode !== "specific_person" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">チームメンバー</CardTitle>
            </CardHeader>
            <CardContent>
              <MemberPicker
                selectedMembers={selectedMembers}
                onMembersChange={setSelectedMembers}
                schedulingMode={form.schedulingMode}
                owner={owner}
              />
            </CardContent>
          </Card>
        )}

        {/* Availability Preview */}
        {owner && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">空き予定プレビュー</CardTitle>
            </CardHeader>
            <CardContent>
              <AvailabilityPreview
                memberUserIds={[
                  owner.id,
                  ...selectedMembers
                    .map((m) => m.id)
                    .filter((id) => id !== owner.id),
                ]}
                durationMinutes={form.durationMinutes}
                schedulingMode={form.schedulingMode}
                slotMode={form.slotMode}
                bufferBeforeMinutes={form.bufferBeforeMinutes}
                bufferAfterMinutes={form.bufferAfterMinutes}
                minNoticeMinutes={form.minNoticeMinutes}
                maxAdvanceDays={form.maxAdvanceDays}
              />
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">カスタム質問</CardTitle>
          </CardHeader>
          <CardContent>
            <CustomQuestionEditor
              questions={customQuestions}
              onChange={setCustomQuestions}
            />
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
                disabled={!!(form.bookingWindowStart || form.bookingWindowEnd)}
              />
              <p className="text-xs text-muted-foreground mt-1">
                ※ 下記「予約可能期間」が指定されている場合は無視されます
              </p>
            </div>
            <div className="border-t pt-4 space-y-3">
              <Label>予約可能期間（絶対日付・任意）</Label>
              <p className="text-xs text-muted-foreground">
                セットすると「最大予約可能日数」より優先されます。キックオフ等で「明日から6/26まで」のような期間限定URL用。
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">
                    開始日
                  </label>
                  <Input
                    type="date"
                    value={form.bookingWindowStart}
                    onChange={(e) => {
                      updateField("bookingWindowStart", e.target.value);
                      if (
                        form.bookingWindowEnd &&
                        form.bookingWindowEnd < e.target.value
                      )
                        updateField("bookingWindowEnd", e.target.value);
                    }}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">
                    終了日
                  </label>
                  <Input
                    type="date"
                    value={form.bookingWindowEnd}
                    min={form.bookingWindowStart || undefined}
                    onChange={(e) =>
                      updateField("bookingWindowEnd", e.target.value)
                    }
                  />
                </div>
              </div>
              {(form.bookingWindowStart || form.bookingWindowEnd) && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    updateField("bookingWindowStart", "");
                    updateField("bookingWindowEnd", "");
                  }}
                >
                  期間指定をクリア
                </Button>
              )}
            </div>
            <div className="border-t pt-4">
              <Label>カレンダーイベントのタイトル形式</Label>
              <Select
                value={form.calendarTitleFormat}
                onValueChange={(v) => updateField("calendarTitleFormat", v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="title_first">
                    イベント名 + 社名/担当者名様
                  </SelectItem>
                  <SelectItem value="company_first">
                    社名/担当者名様 + イベント名
                  </SelectItem>
                  <SelectItem value="company_only">
                    社名 + イベント名
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Googleカレンダー一覧で会社名を頭に出したい場合は「社名/担当者名様 + イベント名」推奨
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
