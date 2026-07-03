"use client";

import { useState, useEffect, use } from "react";
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
import { Switch } from "@/components/ui/switch";
import { MemberPicker } from "@/components/member-picker";
import { AvailabilityPreview } from "@/components/availability-preview";
import {
  BusinessHoursEditor,
  type BusinessHour,
} from "@/components/business-hours-editor";
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

export default function EditEventPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = use(params);
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedMembers, setSelectedMembers] = useState<Member[]>([]);
  const [owner, setOwner] = useState<Member | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [customQuestions, setCustomQuestions] = useState<CustomQuestion[]>([]);
  const [businessHours, setBusinessHours] = useState<BusinessHour[] | null>(null);
  const [form, setForm] = useState({
    title: "",
    slug: "",
    description: "",
    durationMinutes: 30,
    meetingPlatform: "google_meet" as string,
    schedulingMode: "specific_person" as string,
    slotMode: "fixed_slots" as string,
    calendarTitleFormat: "title_first" as string,
    color: "#6366f1",
    isActive: true,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 0,
    minNoticeMinutes: 60,
    maxAdvanceDays: 60,
    bookingWindowStart: "" as string,
    bookingWindowEnd: "" as string,
  });

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/events/${eventId}`);
        if (res.ok) {
          const data = await res.json();
          setForm({
            title: data.title || "",
            slug: data.slug || "",
            description: data.description || "",
            durationMinutes: data.durationMinutes || 30,
            meetingPlatform: data.meetingPlatform || "google_meet",
            schedulingMode: data.schedulingMode || "specific_person",
            slotMode: data.slotMode || "fixed_slots",
            calendarTitleFormat:
              ({
                title_first: "{title}{company}/{name}様",
                company_first: "{company}/{name}様 {title}",
                company_only: "{company} {title}",
              } as Record<string, string>)[data.calendarTitleFormat] ||
              data.calendarTitleFormat ||
              "{title}{company}/{name}様",
            color: data.color || "#6366f1",
            isActive: data.isActive ?? true,
            bufferBeforeMinutes: data.bufferBeforeMinutes || 0,
            bufferAfterMinutes: data.bufferAfterMinutes || 0,
            minNoticeMinutes: data.minNoticeMinutes || 60,
            maxAdvanceDays: data.maxAdvanceDays || 60,
            bookingWindowStart: data.bookingWindowStart || "",
            bookingWindowEnd: data.bookingWindowEnd || "",
          });

          // Store the owner user id and custom questions
          setCurrentUserId(data.userId);
          if (data.customQuestions) {
            setCustomQuestions(data.customQuestions);
          }
          if (Array.isArray(data.businessHours)) {
            setBusinessHours(data.businessHours);
          }

          // Fetch owner profile to display as locked badge in MemberPicker
          fetch(`/api/users/details?ids=${data.userId}`)
            .then((r) => (r.ok ? r.json() : []))
            .then((arr) => arr[0] && setOwner(arr[0]))
            .catch(() => {});

          // Load member details if there are members beyond the owner
          if (data.members && data.members.length > 0) {
            const otherMemberIds = data.members
              .filter((m: { userId: string }) => m.userId !== data.userId)
              .map((m: { userId: string }) => m.userId);

            if (otherMemberIds.length > 0) {
              // Fetch member details
              const memberRes = await fetch(
                `/api/users/details?ids=${otherMemberIds.join(",")}`
              );
              if (memberRes.ok) {
                const memberData = await memberRes.json();
                setSelectedMembers(memberData);
              }
            }
          }
        }
      } catch {
        toast.error("読み込みに失敗しました");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [eventId]);

  function updateField(field: string, value: string | number | boolean) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        bookingWindowStart: form.bookingWindowStart || null,
        bookingWindowEnd: form.bookingWindowEnd || null,
        memberUserIds: selectedMembers.map((m) => m.id),
        customQuestions: customQuestions.length > 0 ? customQuestions : undefined,
        businessHours,
      };

      const res = await fetch(`/api/events/${eventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        toast.success("更新しました");
        router.push("/events");
      } else {
        const data = await res.json().catch(() => ({}));
        const detail = data.details
          ? JSON.stringify(data.details)
          : data.error || `HTTP ${res.status}`;
        console.error("[event PATCH failed]", data);
        toast.error(`更新に失敗しました: ${detail}`);
      }
    } catch (err) {
      console.error("[event PATCH error]", err);
      toast.error("更新に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm("このイベントタイプを削除しますか？")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/events/${eventId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        toast.success("削除しました");
        router.push("/events");
      } else {
        toast.error("削除に失敗しました");
      }
    } catch {
      toast.error("削除に失敗しました");
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-muted-foreground">読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">イベントタイプを編集</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">スケジューリング方式</CardTitle>
          </CardHeader>
          <CardContent>
            <div>
              <Label>予約可能なメンバー構成</Label>
              <Select
                value={form.schedulingMode}
                onValueChange={(v) => updateField("schedulingMode", v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="specific_person">
                    指定メンバーの空き時間（1人）
                  </SelectItem>
                  <SelectItem value="any_available">
                    誰かが空いていればOK（複数名）
                  </SelectItem>
                  <SelectItem value="all_available">
                    全員空いている時のみ（複数名）
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                {form.schedulingMode === "specific_person" &&
                  "オーナーの空き時間だけを先方に提示します（1人用）。複数名で運用するには他のモードを選択してください。"}
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
            <CardTitle className="text-base">
              このイベントの営業日時
            </CardTitle>
          </CardHeader>
          <CardContent>
            <BusinessHoursEditor
              value={businessHours}
              onChange={setBusinessHours}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">基本情報</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <Label>有効/無効</Label>
              <Switch
                checked={form.isActive}
                onCheckedChange={(v) => updateField("isActive", v)}
              />
              <span className="text-sm text-muted-foreground">
                {form.isActive ? "有効" : "無効（予約不可）"}
              </span>
            </div>
            <div>
              <Label htmlFor="title">タイトル</Label>
              <Input
                id="title"
                value={form.title}
                onChange={(e) => updateField("title", e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="slug">URL スラッグ</Label>
              <div className="flex gap-2">
                <Input
                  id="slug"
                  value={form.slug}
                  onChange={(e) => updateField("slug", e.target.value)}
                  required
                  className="font-mono"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
                    const arr = new Uint8Array(10);
                    crypto.getRandomValues(arr);
                    updateField(
                      "slug",
                      Array.from(arr, (b) => chars[b % chars.length]).join("")
                    );
                  }}
                >
                  再生成
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                変更すると既存の公開URLは無効になります
              </p>
            </div>
            <div>
              <Label htmlFor="description">説明</Label>
              <Textarea
                id="description"
                value={form.description}
                onChange={(e) => updateField("description", e.target.value)}
                rows={3}
              />
            </div>
            <div>
              <Label>所要時間</Label>
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
                  <SelectItem value="none">なし</SelectItem>
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
        {(owner || currentUserId) && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">空き予定プレビュー</CardTitle>
            </CardHeader>
            <CardContent>
              <AvailabilityPreview
                memberUserIds={[
                  ...(owner ? [owner.id] : [currentUserId]),
                  ...selectedMembers
                    .map((m) => m.id)
                    .filter(
                      (id) => id !== (owner ? owner.id : currentUserId)
                    ),
                ]}
                durationMinutes={form.durationMinutes}
                schedulingMode={
                  form.schedulingMode as
                    | "any_available"
                    | "all_available"
                    | "specific_person"
                }
                slotMode={
                  form.slotMode as "fixed_slots" | "flexible_start"
                }
                bufferBeforeMinutes={form.bufferBeforeMinutes}
                bufferAfterMinutes={form.bufferAfterMinutes}
                minNoticeMinutes={form.minNoticeMinutes}
                maxAdvanceDays={form.maxAdvanceDays}
                excludeEventTypeId={eventId}
                businessHours={businessHours}
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
                <Label>バッファ（前・分）</Label>
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
                <Label>バッファ（後・分）</Label>
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
                セットすると「最大予約可能日数」より優先されます。キックオフなど特定期間限定のURL用。
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
                  期間指定をクリア（相対日数に戻す）
                </Button>
              )}
            </div>
            <div className="border-t pt-4">
              <Label htmlFor="calendarTitleFormat">
                カレンダーイベントのタイトル形式
              </Label>
              <Input
                id="calendarTitleFormat"
                value={form.calendarTitleFormat}
                onChange={(e) =>
                  updateField("calendarTitleFormat", e.target.value)
                }
                placeholder="{title}{company}/{name}様"
                className="font-mono"
              />
              <div className="text-xs text-muted-foreground mt-2 space-y-1">
                <p>
                  プレースホルダー: <code className="bg-muted px-1 rounded">{"{title}"}</code> イベント名 /{" "}
                  <code className="bg-muted px-1 rounded">{"{company}"}</code> 社名 /{" "}
                  <code className="bg-muted px-1 rounded">{"{name}"}</code> 担当者名
                </p>
                <p>
                  もともとの形式: <code className="bg-muted px-1 rounded">{"{title}{company}/{name}様"}</code>
                </p>
                <p>
                  プレビュー:{" "}
                  <span className="font-mono">
                    {(form.calendarTitleFormat || "{title}{company}/{name}様")
                      .replaceAll("{title}", form.title || "30分商談")
                      .replaceAll("{company}", "株式会社A")
                      .replaceAll("{name}", "山田太郎")}
                  </span>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button type="submit" disabled={saving} className="flex-1">
            {saving ? "保存中..." : "保存"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/events")}
          >
            キャンセル
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? "削除中..." : "削除"}
          </Button>
        </div>
      </form>
    </div>
  );
}
