"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface ExportTask {
  id: string;
  name: string;
  spreadsheetUrl: string;
  sheetName: string | null;
  eventTypeId: string | null;
  assigneeUserId: string | null;
  status: "confirmed" | "cancelled" | "all";
  daysBack: number | null;
  fromDate: string | null;
  toDate: string | null;
  includeHeader: boolean;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  lastRunError: string | null;
  lastRunRowCount: number | null;
  updatedAt: string;
}

interface EventTypeOpt {
  id: string;
  title: string;
}

interface UserOpt {
  id: string;
  name: string | null;
  email: string;
}

const EMPTY_TASK: Omit<ExportTask, "id" | "updatedAt" | "lastRunAt" | "lastRunStatus" | "lastRunError" | "lastRunRowCount"> = {
  name: "",
  spreadsheetUrl: "",
  sheetName: null,
  eventTypeId: null,
  assigneeUserId: null,
  status: "confirmed",
  daysBack: 30,
  fromDate: null,
  toDate: null,
  includeHeader: false,
};

export default function ExportsPage() {
  const searchParams = useSearchParams();
  const [tasks, setTasks] = useState<ExportTask[]>([]);
  const [events, setEvents] = useState<EventTypeOpt[]>([]);
  const [teamUsers, setTeamUsers] = useState<UserOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<typeof EMPTY_TASK>({ ...EMPTY_TASK });
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState<string>("k.yasui@raksul.com");

  useEffect(() => {
    fetch("/api/sheets/writer")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.inviteEmail && setInviteEmail(d.inviteEmail))
      .catch(() => {});
  }, []);

  async function loadTasks() {
    const res = await fetch("/api/exports");
    if (res.ok) setTasks(await res.json());
  }

  async function loadOptions() {
    const [ev, sd] = await Promise.all([
      fetch("/api/events").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/users/same-domain").then((r) => (r.ok ? r.json() : [])),
    ]);
    setEvents(ev);
    setTeamUsers(sd);
  }

  useEffect(() => {
    Promise.all([loadTasks(), loadOptions()]).finally(() => setLoading(false));
  }, []);

  // Auto-open new task form when ?new=1 (optionally with eventTypeId prefilled)
  // or edit form when ?edit=<taskId>
  useEffect(() => {
    if (loading) return;
    if (searchParams.get("new") === "1") {
      const prefEventTypeId = searchParams.get("eventTypeId");
      setForm({
        ...EMPTY_TASK,
        eventTypeId: prefEventTypeId || null,
      });
      setEditingId("new");
    } else {
      const editId = searchParams.get("edit");
      if (editId) {
        const target = tasks.find((t) => t.id === editId);
        if (target) openEdit(target);
      }
    }
    // Only on first ready render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, tasks.length]);

  function openNew() {
    setForm({ ...EMPTY_TASK });
    setEditingId("new");
  }

  function openEdit(t: ExportTask) {
    setForm({
      name: t.name,
      spreadsheetUrl: t.spreadsheetUrl,
      sheetName: t.sheetName,
      eventTypeId: t.eventTypeId,
      assigneeUserId: t.assigneeUserId,
      status: t.status,
      daysBack: t.daysBack,
      fromDate: t.fromDate,
      toDate: t.toDate,
      includeHeader: t.includeHeader,
    });
    setEditingId(t.id);
  }

  async function saveTask() {
    setSaving(true);
    try {
      const payload = {
        ...form,
        sheetName: form.sheetName || null,
        eventTypeId: form.eventTypeId || null,
        assigneeUserId: form.assigneeUserId || null,
        daysBack: form.daysBack || null,
        fromDate: form.fromDate || null,
        toDate: form.toDate || null,
      };
      const res = await fetch(
        editingId === "new" ? "/api/exports" : `/api/exports/${editingId}`,
        {
          method: editingId === "new" ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      if (res.ok) {
        toast.success("保存しました");
        setEditingId(null);
        await loadTasks();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "保存に失敗しました");
      }
    } catch {
      toast.error("保存に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  async function deleteTask(id: string) {
    if (!confirm("このタスクを削除しますか？")) return;
    const res = await fetch(`/api/exports/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("削除しました");
      await loadTasks();
    } else {
      toast.error("削除に失敗しました");
    }
  }

  async function runTask(id: string) {
    setRunning(id);
    try {
      const res = await fetch(`/api/exports/${id}/run`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        toast.success(`${data.appended}件をシートに追記しました`);
      } else {
        toast.error(data.error || "実行に失敗しました");
      }
      await loadTasks();
    } catch {
      toast.error("実行に失敗しました");
    } finally {
      setRunning(null);
    }
  }

  const eventTitleById = new Map(events.map((e) => [e.id, e.title]));
  const userNameById = new Map(
    teamUsers.map((u) => [u.id, u.name || u.email])
  );

  const fmtDate = (iso: string | null) =>
    iso
      ? new Intl.DateTimeFormat("ja-JP", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }).format(new Date(iso))
      : "-";

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-muted-foreground">読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">スプレッドシート排出</h1>
          <p className="text-muted-foreground">
            フィルタ条件を付けた排出タスクを複数管理できます
          </p>
        </div>
        <Button onClick={openNew}>新規タスクを作成</Button>
      </div>

      {tasks.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground mb-4">
              まだ排出タスクがありません
            </p>
            <Button onClick={openNew}>タスクを作成する</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {tasks.map((t) => (
            <Card key={t.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <CardTitle className="text-base">{t.name}</CardTitle>
                    <a
                      href={t.spreadsheetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline break-all"
                    >
                      {t.spreadsheetUrl}
                    </a>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => runTask(t.id)}
                      disabled={running === t.id}
                    >
                      {running === t.id ? "実行中..." : "実行"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openEdit(t)}
                    >
                      編集
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => deleteTask(t.id)}
                      className="text-destructive"
                    >
                      削除
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="text-xs space-y-2">
                <div className="flex flex-wrap gap-1">
                  <Badge variant="secondary">
                    {t.eventTypeId
                      ? `イベント: ${eventTitleById.get(t.eventTypeId) || "?"}`
                      : "全イベント"}
                  </Badge>
                  <Badge variant="secondary">
                    {t.assigneeUserId
                      ? `担当: ${userNameById.get(t.assigneeUserId) || "?"}`
                      : "全担当者"}
                  </Badge>
                  <Badge variant="secondary">
                    {t.status === "confirmed"
                      ? "確定のみ"
                      : t.status === "cancelled"
                      ? "キャンセルのみ"
                      : "全ステータス"}
                  </Badge>
                  <Badge variant="secondary">
                    {t.daysBack
                      ? `直近${t.daysBack}日`
                      : t.fromDate || t.toDate
                      ? `${t.fromDate || "..."} 〜 ${t.toDate || "..."}`
                      : "全期間"}
                  </Badge>
                  {t.includeHeader && (
                    <Badge variant="outline">ヘッダ行追加</Badge>
                  )}
                  {t.sheetName && (
                    <Badge variant="outline">シート: {t.sheetName}</Badge>
                  )}
                </div>
                {t.lastRunAt && (
                  <div
                    className={`text-xs ${
                      t.lastRunStatus === "error"
                        ? "text-destructive"
                        : "text-muted-foreground"
                    }`}
                  >
                    最終実行: {fmtDate(t.lastRunAt)}{" "}
                    {t.lastRunStatus === "success"
                      ? `→ 成功 (${t.lastRunRowCount}件)`
                      : t.lastRunStatus === "error"
                      ? `→ 失敗: ${t.lastRunError}`
                      : ""}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {editingId && (
        <Card className="border-primary">
          <CardHeader>
            <CardTitle className="text-base">
              {editingId === "new" ? "新規タスク" : "タスクを編集"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>タスク名</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="例: 週次商談レポート"
                required
              />
            </div>
            <div>
              <Label>スプレッドシート URL</Label>
              <Input
                type="url"
                value={form.spreadsheetUrl}
                onChange={(e) =>
                  setForm((p) => ({ ...p, spreadsheetUrl: e.target.value }))
                }
                placeholder="https://docs.google.com/spreadsheets/d/..."
              />
              <p className="text-xs text-muted-foreground mt-1 break-all">
                <span className="font-mono">{inviteEmail}</span> を編集者として招待してください
              </p>
            </div>
            <div>
              <Label>シート名（省略時は1枚目）</Label>
              <Input
                value={form.sheetName || ""}
                onChange={(e) =>
                  setForm((p) => ({ ...p, sheetName: e.target.value || null }))
                }
                placeholder="例: 予約履歴"
              />
            </div>

            <div className="border-t pt-4 space-y-4">
              <p className="text-sm font-medium">フィルタ条件</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>イベント</Label>
                  <Select
                    value={form.eventTypeId || "__ALL__"}
                    onValueChange={(v) =>
                      setForm((p) => ({
                        ...p,
                        eventTypeId: v === "__ALL__" ? null : v,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__ALL__">全イベント</SelectItem>
                      {events.map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>担当者</Label>
                  <Select
                    value={form.assigneeUserId || "__ALL__"}
                    onValueChange={(v) =>
                      setForm((p) => ({
                        ...p,
                        assigneeUserId: v === "__ALL__" ? null : v,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__ALL__">全担当者</SelectItem>
                      {teamUsers.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.name || u.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>ステータス</Label>
                  <Select
                    value={form.status}
                    onValueChange={(v) =>
                      setForm((p) => ({
                        ...p,
                        status: v as "confirmed" | "cancelled" | "all",
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="confirmed">確定のみ</SelectItem>
                      <SelectItem value="cancelled">キャンセルのみ</SelectItem>
                      <SelectItem value="all">すべて</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>期間: 直近N日</Label>
                  <Input
                    type="number"
                    value={form.daysBack || ""}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        daysBack: e.target.value
                          ? parseInt(e.target.value)
                          : null,
                      }))
                    }
                    placeholder="例: 30"
                    min={1}
                    max={3650}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    設定時は絶対日付より優先
                  </p>
                </div>
                <div>
                  <Label>期間: 開始日</Label>
                  <Input
                    type="date"
                    value={form.fromDate || ""}
                    disabled={!!form.daysBack}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        fromDate: e.target.value || null,
                      }))
                    }
                  />
                </div>
                <div>
                  <Label>期間: 終了日</Label>
                  <Input
                    type="date"
                    value={form.toDate || ""}
                    disabled={!!form.daysBack}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, toDate: e.target.value || null }))
                    }
                  />
                </div>
              </div>
            </div>

            <div className="border-t pt-4 flex items-center gap-3">
              <Switch
                checked={form.includeHeader}
                onCheckedChange={(v) =>
                  setForm((p) => ({ ...p, includeHeader: v }))
                }
              />
              <div>
                <Label>ヘッダ行を先頭に追加</Label>
                <p className="text-xs text-muted-foreground">
                  ONにすると実行のたびに列名の行が先頭に追加されます
                </p>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button onClick={saveTask} disabled={saving || !form.name || !form.spreadsheetUrl}>
                {saving ? "保存中..." : "保存"}
              </Button>
              <Button
                variant="ghost"
                onClick={() => setEditingId(null)}
              >
                キャンセル
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
