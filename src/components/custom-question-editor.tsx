"use client";

import { useState } from "react";
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
import type { CustomQuestion, QuestionType } from "@/lib/validations/event";

const QUESTION_TYPES: { value: QuestionType; label: string; icon: string }[] = [
  { value: "text", label: "テキスト（短文）", icon: "Aa" },
  { value: "textarea", label: "テキスト（長文）", icon: "¶" },
  { value: "radio", label: "ラジオボタン（単一選択）", icon: "◉" },
  { value: "checkbox", label: "チェックボックス（複数選択）", icon: "☑" },
  { value: "select", label: "ドロップダウン", icon: "▾" },
  { value: "phone", label: "電話番号", icon: "☎" },
  { value: "number", label: "数値", icon: "#" },
];

interface CustomQuestionEditorProps {
  questions: CustomQuestion[];
  onChange: (questions: CustomQuestion[]) => void;
}

export function CustomQuestionEditor({
  questions,
  onChange,
}: CustomQuestionEditorProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function addQuestion() {
    const newQ: CustomQuestion = {
      id: crypto.randomUUID(),
      question: "",
      type: "text",
      required: false,
    };
    onChange([...questions, newQ]);
    setExpandedId(newQ.id);
  }

  function updateQuestion(index: number, updates: Partial<CustomQuestion>) {
    const updated = [...questions];
    updated[index] = { ...updated[index], ...updates };
    onChange(updated);
  }

  function removeQuestion(index: number) {
    onChange(questions.filter((_, i) => i !== index));
  }

  function moveQuestion(index: number, direction: "up" | "down") {
    if (
      (direction === "up" && index === 0) ||
      (direction === "down" && index === questions.length - 1)
    )
      return;
    const updated = [...questions];
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    [updated[index], updated[swapIndex]] = [updated[swapIndex], updated[index]];
    onChange(updated);
  }

  function duplicateQuestion(index: number) {
    const original = questions[index];
    const copy: CustomQuestion = {
      ...original,
      id: crypto.randomUUID(),
      question: original.question + "（コピー）",
    };
    const updated = [...questions];
    updated.splice(index + 1, 0, copy);
    onChange(updated);
    setExpandedId(copy.id);
  }

  function addOption(questionIndex: number) {
    const q = questions[questionIndex];
    const options = q.options || [];
    updateQuestion(questionIndex, {
      options: [...options, `選択肢 ${options.length + 1}`],
    });
  }

  function updateOption(
    questionIndex: number,
    optionIndex: number,
    value: string
  ) {
    const q = questions[questionIndex];
    const options = [...(q.options || [])];
    options[optionIndex] = value;
    updateQuestion(questionIndex, { options });
  }

  function removeOption(questionIndex: number, optionIndex: number) {
    const q = questions[questionIndex];
    const options = (q.options || []).filter((_, i) => i !== optionIndex);
    updateQuestion(questionIndex, { options });
  }

  const needsOptions = (type: string) =>
    ["radio", "checkbox", "select"].includes(type);

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        予約時にゲストに回答してもらう質問を追加できます。テキスト・選択式・電話番号など様々な形式に対応しています。
      </p>

      {questions.length === 0 && (
        <div className="text-center py-8 border-2 border-dashed rounded-lg">
          <p className="text-sm text-muted-foreground mb-3">
            まだ質問がありません
          </p>
          <Button type="button" variant="outline" size="sm" onClick={addQuestion}>
            + 最初の質問を追加
          </Button>
        </div>
      )}

      {questions.map((q, index) => {
        const isExpanded = expandedId === q.id;
        const typeInfo = QUESTION_TYPES.find((t) => t.value === q.type);

        return (
          <div
            key={q.id}
            className={`border rounded-lg transition-all ${
              isExpanded
                ? "border-primary shadow-sm"
                : "border-border hover:border-muted-foreground/30"
            }`}
          >
            {/* Header - always visible */}
            <div
              className="flex items-center gap-2 p-3 cursor-pointer"
              onClick={() => setExpandedId(isExpanded ? null : q.id)}
            >
              <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">
                {typeInfo?.icon || "Aa"}
              </span>
              <span className="flex-1 text-sm font-medium truncate">
                {q.question || (
                  <span className="text-muted-foreground italic">
                    未入力の質問
                  </span>
                )}
              </span>
              <div className="flex items-center gap-1">
                {q.required && (
                  <span className="text-xs bg-destructive/10 text-destructive px-1.5 py-0.5 rounded">
                    必須
                  </span>
                )}
                <span className="text-xs text-muted-foreground">
                  {isExpanded ? "▲" : "▼"}
                </span>
              </div>
            </div>

            {/* Expanded editor */}
            {isExpanded && (
              <div className="px-3 pb-3 space-y-3 border-t pt-3">
                {/* Question text */}
                <div>
                  <Label className="text-xs">質問文</Label>
                  <Input
                    value={q.question}
                    onChange={(e) =>
                      updateQuestion(index, { question: e.target.value })
                    }
                    placeholder="質問を入力してください..."
                    className="mt-1"
                  />
                </div>

                {/* Description */}
                <div>
                  <Label className="text-xs">説明文（任意）</Label>
                  <Input
                    value={q.description || ""}
                    onChange={(e) =>
                      updateQuestion(index, {
                        description: e.target.value || undefined,
                      })
                    }
                    placeholder="質問の補足説明..."
                    className="mt-1 text-xs"
                  />
                </div>

                {/* Question type & required */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">質問の種類</Label>
                    <Select
                      value={q.type}
                      onValueChange={(v) => {
                        const updates: Partial<CustomQuestion> = {
                          type: v as QuestionType,
                        };
                        // Initialize options when switching to choice type
                        if (
                          needsOptions(v) &&
                          (!q.options || q.options.length === 0)
                        ) {
                          updates.options = ["選択肢 1", "選択肢 2"];
                        }
                        updateQuestion(index, updates);
                      }}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {QUESTION_TYPES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>
                            <span className="font-mono mr-1.5">{t.icon}</span>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col justify-end">
                    <label className="flex items-center gap-2 text-sm h-9 px-3 border rounded-md cursor-pointer hover:bg-muted/50">
                      <input
                        type="checkbox"
                        checked={q.required}
                        onChange={(e) =>
                          updateQuestion(index, { required: e.target.checked })
                        }
                        className="rounded"
                      />
                      必須にする
                    </label>
                  </div>
                </div>

                {/* Placeholder */}
                {!needsOptions(q.type) && (
                  <div>
                    <Label className="text-xs">プレースホルダー（任意）</Label>
                    <Input
                      value={q.placeholder || ""}
                      onChange={(e) =>
                        updateQuestion(index, {
                          placeholder: e.target.value || undefined,
                        })
                      }
                      placeholder="入力欄に表示するヒント..."
                      className="mt-1 text-xs"
                    />
                  </div>
                )}

                {/* Options editor for radio/checkbox/select */}
                {needsOptions(q.type) && (
                  <div>
                    <Label className="text-xs">選択肢</Label>
                    <div className="space-y-2 mt-1">
                      {(q.options || []).map((opt, optIndex) => (
                        <div key={optIndex} className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground w-5 text-center shrink-0">
                            {q.type === "radio" && "○"}
                            {q.type === "checkbox" && "☐"}
                            {q.type === "select" && `${optIndex + 1}.`}
                          </span>
                          <Input
                            value={opt}
                            onChange={(e) =>
                              updateOption(index, optIndex, e.target.value)
                            }
                            className="text-sm"
                            placeholder={`選択肢 ${optIndex + 1}`}
                          />
                          {(q.options || []).length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 shrink-0"
                              onClick={() => removeOption(index, optIndex)}
                            >
                              ✕
                            </Button>
                          )}
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-xs"
                        onClick={() => addOption(index)}
                      >
                        + 選択肢を追加
                      </Button>
                    </div>
                  </div>
                )}

                {/* Preview */}
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-2">
                    プレビュー
                  </p>
                  <QuestionPreview question={q} />
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between pt-1 border-t">
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => moveQuestion(index, "up")}
                      disabled={index === 0}
                    >
                      ↑
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => moveQuestion(index, "down")}
                      disabled={index === questions.length - 1}
                    >
                      ↓
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => duplicateQuestion(index)}
                    >
                      複製
                    </Button>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-destructive hover:text-destructive"
                    onClick={() => removeQuestion(index)}
                  >
                    削除
                  </Button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {questions.length > 0 && (
        <Button type="button" variant="outline" size="sm" onClick={addQuestion}>
          + 質問を追加
        </Button>
      )}
    </div>
  );
}

// Preview component showing how the question will look to guests
function QuestionPreview({ question }: { question: CustomQuestion }) {
  const { type, question: label, description, placeholder, options, required } =
    question;

  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">
        {label || "質問文"}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </p>
      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}

      {type === "text" && (
        <div className="bg-background border rounded-md px-3 py-2 text-sm text-muted-foreground">
          {placeholder || "回答を入力..."}
        </div>
      )}

      {type === "textarea" && (
        <div className="bg-background border rounded-md px-3 py-2 text-sm text-muted-foreground min-h-[60px]">
          {placeholder || "回答を入力..."}
        </div>
      )}

      {type === "radio" &&
        (options || []).map((opt, i) => (
          <label key={i} className="flex items-center gap-2 text-sm">
            <input type="radio" disabled name={`preview-${question.id}`} />
            {opt}
          </label>
        ))}

      {type === "checkbox" &&
        (options || []).map((opt, i) => (
          <label key={i} className="flex items-center gap-2 text-sm">
            <input type="checkbox" disabled />
            {opt}
          </label>
        ))}

      {type === "select" && (
        <div className="bg-background border rounded-md px-3 py-2 text-sm text-muted-foreground">
          選択してください ▾
        </div>
      )}

      {type === "phone" && (
        <div className="bg-background border rounded-md px-3 py-2 text-sm text-muted-foreground">
          {placeholder || "090-1234-5678"}
        </div>
      )}

      {type === "number" && (
        <div className="bg-background border rounded-md px-3 py-2 text-sm text-muted-foreground">
          {placeholder || "数値を入力..."}
        </div>
      )}
    </div>
  );
}
