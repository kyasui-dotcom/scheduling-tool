"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export default function SettingsPage() {
  const { data: session } = useSession();
  const [username, setUsername] = useState("");
  const [timezone, setTimezone] = useState("Asia/Tokyo");
  const [defaultSlackWebhookUrl, setDefaultSlackWebhookUrl] = useState("");
  const [defaultSpreadsheetUrl, setDefaultSpreadsheetUrl] = useState("");
  const [defaultCalendarTitleFormat, setDefaultCalendarTitleFormat] = useState(
    "{title}{company}/{name}様"
  );
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/settings");
        if (res.ok) {
          const data = await res.json();
          setUsername(data.username || "");
          setTimezone(data.timezone || "Asia/Tokyo");
          setDefaultSlackWebhookUrl(data.defaultSlackWebhookUrl || "");
          setDefaultSpreadsheetUrl(data.defaultSpreadsheetUrl || "");
          setDefaultCalendarTitleFormat(
            data.defaultCalendarTitleFormat || "{title}{company}/{name}様"
          );
        }
      } catch {
        // Use defaults
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          timezone,
          defaultSlackWebhookUrl,
          defaultSpreadsheetUrl,
          defaultCalendarTitleFormat,
        }),
      });
      if (res.ok) {
        toast.success("設定を保存しました");
      } else {
        const data = await res.json();
        toast.error(data.error || "保存に失敗しました");
      }
    } catch {
      toast.error("保存に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-muted-foreground">読み込み中...</p>
      </div>
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">設定</h1>
        <p className="text-muted-foreground">プロフィールと基本設定</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">プロフィール</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>名前</Label>
            <Input value={session?.user?.name || ""} disabled />
            <p className="text-xs text-muted-foreground mt-1">
              Googleアカウントの名前が使用されます
            </p>
          </div>
          <div>
            <Label>メールアドレス</Label>
            <Input value={session?.user?.email || ""} disabled />
          </div>
          <div>
            <Label htmlFor="username">ユーザー名（URL）</Label>
            <Input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="your-name"
            />
            <p className="text-xs text-muted-foreground mt-1">
              予約ページURL: {appUrl}/{username || "your-name"}
            </p>
          </div>
        </CardContent>
      </Card>

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
            <option value="America/Los_Angeles">
              America/Los_Angeles (PST)
            </option>
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
          <CardTitle className="text-base">
            イベント作成時のデフォルト
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            ここで設定した値は、新しくイベントを作成する時にフォームにプリセットされます。個別イベントで上書き可能です。
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="def-slack">
              Slack Webhook URL（デフォルト）
            </Label>
            <Input
              id="def-slack"
              type="url"
              value={defaultSlackWebhookUrl}
              onChange={(e) => setDefaultSlackWebhookUrl(e.target.value)}
              placeholder="https://hooks.slack.com/services/..."
            />
            <p className="text-xs text-muted-foreground mt-1">
              新規イベント作成時に自動セットされ、その時点から編集可能
            </p>
          </div>
          <div>
            <Label htmlFor="def-sheet">
              Google スプレッドシート URL（デフォルト）
            </Label>
            <Input
              id="def-sheet"
              type="url"
              value={defaultSpreadsheetUrl}
              onChange={(e) => setDefaultSpreadsheetUrl(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/.../edit#gid=..."
            />
            <p className="text-xs text-muted-foreground mt-1">
              「共通の受け皿シートを1枚用意しておく」場合など
            </p>
          </div>
          <div>
            <Label htmlFor="def-title">
              カレンダーイベントのタイトル形式（デフォルト）
            </Label>
            <Input
              id="def-title"
              value={defaultCalendarTitleFormat}
              onChange={(e) => setDefaultCalendarTitleFormat(e.target.value)}
              placeholder="{title}{company}/{name}様"
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground mt-1">
              プレースホルダー: <code>{"{title}"}</code> / <code>{"{company}"}</code> / <code>{"{name}"}</code>
            </p>
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving} className="w-full">
        {saving ? "保存中..." : "設定を保存"}
      </Button>
    </div>
  );
}
