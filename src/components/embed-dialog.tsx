"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";

interface EmbedDialogProps {
  username: string;
  slug: string;
  appUrl: string;
}

export function EmbedDialog({ username, slug, appUrl }: EmbedDialogProps) {
  const [width, setWidth] = useState("100%");
  const [height, setHeight] = useState("700");

  const publicUrl = `${appUrl}/b/${slug}`;
  const embedUrl = `${appUrl}/embed/b/${slug}`;
  const iframeCode = `<iframe src="${embedUrl}" width="${width}" height="${height}px" frameborder="0" style="border: 1px solid #e5e7eb; border-radius: 8px;"></iframe>`;
  const linkCode = `<a href="${publicUrl}" target="_blank" style="display:inline-block;padding:12px 24px;background:#6366f1;color:white;border-radius:8px;text-decoration:none;font-weight:500;">予約する</a>`;
  const popupCode = `<button onclick="openMeetingPopup('${embedUrl}')" style="padding:12px 24px;background:#6366f1;color:#fff;border:0;border-radius:8px;font-weight:500;cursor:pointer;">予約する</button>
<script>
window.openMeetingPopup=function(u){var o=document.createElement('div');o.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;';o.onclick=function(e){if(e.target===o)document.body.removeChild(o)};var f=document.createElement('iframe');f.src=u;f.style.cssText='width:100%;max-width:960px;height:85vh;border:0;border-radius:12px;background:#fff;box-shadow:0 20px 60px rgba(0,0,0,.3);';var c=document.createElement('button');c.textContent='×';c.style.cssText='position:absolute;top:24px;right:24px;font-size:24px;background:#fff;border:0;border-radius:50%;width:40px;height:40px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.2);';c.onclick=function(){document.body.removeChild(o)};o.appendChild(f);o.appendChild(c);document.body.appendChild(o);};
</script>`;

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    toast.success("コピーしました");
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          埋め込み
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>埋め込みコード</DialogTitle>
        </DialogHeader>
        <div className="space-y-6">
          {/* Inline embed */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">
              インライン埋め込み（iframe）
            </h3>
            <p className="text-xs text-muted-foreground">
              自社サイトにカレンダーを直接埋め込みます
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">横幅</Label>
                <Input
                  value={width}
                  onChange={(e) => setWidth(e.target.value)}
                  placeholder="100%"
                />
              </div>
              <div>
                <Label className="text-xs">高さ (px)</Label>
                <Input
                  value={height}
                  onChange={(e) => setHeight(e.target.value)}
                  placeholder="700"
                />
              </div>
            </div>
            <div className="relative">
              <pre className="bg-muted p-3 rounded-lg text-xs overflow-x-auto whitespace-pre-wrap break-all">
                {iframeCode}
              </pre>
              <Button
                variant="secondary"
                size="sm"
                className="absolute top-2 right-2"
                onClick={() => copyToClipboard(iframeCode)}
              >
                コピー
              </Button>
            </div>
          </div>

          {/* Popup embed */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">
              ポップアップ埋め込み（ボタン + モーダル）
            </h3>
            <p className="text-xs text-muted-foreground">
              サイトにボタンを設置し、クリックで予約カレンダーを**ポップアップで表示**します。ページ遷移なしで予約フローが完結。
            </p>
            <div className="relative">
              <pre className="bg-muted p-3 rounded-lg text-xs overflow-x-auto whitespace-pre-wrap break-all max-h-40">
                {popupCode}
              </pre>
              <Button
                variant="secondary"
                size="sm"
                className="absolute top-2 right-2"
                onClick={() => copyToClipboard(popupCode)}
              >
                コピー
              </Button>
            </div>
          </div>

          {/* Button link (page navigation) */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">
              予約ボタンリンク（ページ移動）
            </h3>
            <p className="text-xs text-muted-foreground">
              サイトに予約ボタンを設置します。クリックすると別タブで予約ページが開きます。
            </p>
            <div className="relative">
              <pre className="bg-muted p-3 rounded-lg text-xs overflow-x-auto whitespace-pre-wrap break-all">
                {linkCode}
              </pre>
              <Button
                variant="secondary"
                size="sm"
                className="absolute top-2 right-2"
                onClick={() => copyToClipboard(linkCode)}
              >
                コピー
              </Button>
            </div>
          </div>

          {/* Direct URL */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">直接リンク</h3>
            <div className="flex gap-2">
              <Input
                value={publicUrl}
                readOnly
                className="text-xs font-mono"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyToClipboard(publicUrl)}
              >
                コピー
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
