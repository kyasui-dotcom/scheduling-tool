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

export default function NewEventPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [selectedMembers, setSelectedMembers] = useState<Member[]>([]);
  const [me, setMe] = useState<Member | null>(null);
  const [owner, setOwner] = useState<Member | null>(null);
  const [sameDomainUsers, setSameDomainUsers] = useState<Member[]>([]);
  const [customQuestions, setCustomQuestions] = useState<CustomQuestion[]>([]);
  const [businessHours, setBusinessHours] = useState<BusinessHour[] | null>(null);
  const [inviteEmail, setInviteEmail] = useState<string>("k.yasui@raksul.com");

  useEffect(() => {
    fetch("/api/sheets/writer")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.inviteEmail && setInviteEmail(d.inviteEmail))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/users/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((u) => {
        if (u) {
          setMe(u);
          setOwner(u);
          // Apply user's own defaults to the new event form
          setForm((prev) => ({
            ...prev,
            slackWebhookUrl:
              prev.slackWebhookUrl || u.defaultSlackWebhookUrl || "",
            spreadsheetUrl:
              prev.spreadsheetUrl || u.defaultSpreadsheetUrl || "",
            calendarTitleFormat:
              u.defaultCalendarTitleFormat || prev.calendarTitleFormat,
          }));
        }
      })
      .catch(() => {});
    fetch("/api/users/same-domain")
      .then((r) => (r.ok ? r.json() : []))
      .then((arr) => setSameDomainUsers(arr || []))
      .catch(() => {});
    // Generate a random URL slug on mount so URLs are unguessable
    setForm((prev) => ({ ...prev, slug: generateRandomSlug() }));
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
    calendarTitleFormat: "{title}{company}/{name}様",
    color: "#6366f1",
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 0,
    minNoticeMinutes: 60,
    maxAdvanceDays: 60,
    bookingWindowStart: "" as string,
    bookingWindowEnd: "" as string,
    spreadsheetUrl: "" as string,
    slackWebhookUrl: "" as string,
  });

  function generateRandomSlug(length = 10): string {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    const arr = new Uint8Array(length);
    crypto.getRandomValues(arr);
    return Array.from(arr, (b) => chars[b % chars.length]).join("");
  }

  function updateField(field: string, value: string | number) {
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
        spreadsheetUrl: form.spreadsheetUrl || null,
        slackWebhookUrl: form.slackWebhookUrl || null,
        ownerUserId: owner && me && owner.id !== me.id ? owner.id : undefined,
        memberUserIds: selectedMembers.map((m) => m.id),
        customQuestions: customQuestions.length > 0 ? customQuestions : undefined,
        businessHours,
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
              <div className="flex gap-2">
                <Input
                  id="slug"
                  value={form.slug}
                  onChange={(e) => updateField("slug", e.target.value)}
                  placeholder="例: a1b2c3d4e5"
                  required
                  className="font-mono"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => updateField("slug", generateRandomSlug())}
                >
                  再生成
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                URLの一部として使用されます（英数字とハイフンのみ）。デフォルトで10文字の乱数が生成されます。
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

        <Card>
          <CardHeader>
            <CardTitle className="text-base">外部連携</CardTitle>
          </CardHeader>
          <CardContent>
            <div>
              <Label htmlFor="spreadsheetUrl">
                Google スプレッドシート URL
              </Label>
              <Input
                id="spreadsheetUrl"
                type="url"
                value={form.spreadsheetUrl}
                onChange={(e) =>
                  updateField("spreadsheetUrl", e.target.value)
                }
                placeholder="https://docs.google.com/spreadsheets/d/.../edit#gid=..."
              />
              <p className="text-xs text-muted-foreground mt-1">
                書き込み先タブを固定するには、対象のシートを開いた状態のURL (末尾に <span className="font-mono">#gid=...</span> が付いたもの) をコピーしてください。省略時は1枚目のシートに書き込みます。
              </p>
              <div className="text-xs text-muted-foreground mt-2 space-y-1">
                <p>
                  設定すると予約が入るたびに 1行追加されます。列順:
                </p>
                <p className="font-mono">
                  予約日時 / 開始 / 終了 / イベント名 / 社名 / 担当者名 /
                  メール / 顧客メモ / カスタム質問回答 / 会議URL
                </p>
                <p className="text-amber-700 font-medium break-all">
                  ※ 対象のスプレッドシートに <span className="font-mono">{inviteEmail}</span> を編集者として招待してください
                </p>
                <p>
                  書き込みは上記アカウントで実行されます（担当者側の権限は不要）
                </p>
              </div>
            </div>

            <div className="border-t pt-4">
              <Label htmlFor="slackWebhookUrl">
                Slack Incoming Webhook URL
              </Label>
              <Input
                id="slackWebhookUrl"
                type="url"
                value={form.slackWebhookUrl}
                onChange={(e) =>
                  updateField("slackWebhookUrl", e.target.value)
                }
                placeholder="https://hooks.slack.com/services/T.../B.../..."
              />
              <p className="text-xs text-muted-foreground mt-1">
                設定すると予約が入るたびに指定 Slack チャンネルに通知します（未設定なら環境変数 <span className="font-mono">WEBHOOKURL</span> が使われます）。
                Slack ワークスペース → アプリ → Incoming Webhook で発行してください。
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
