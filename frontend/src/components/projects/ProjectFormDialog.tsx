"use client";

import { useEffect, useState } from "react";
import { Check, LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type {
  ProjectColorKey,
  ProjectIconKey,
  ProjectOut,
} from "@/lib/api";
import {
  PROJECT_COLORS,
  PROJECT_ICONS,
} from "@/lib/project-appearance";
import { cn } from "@/lib/utils";

export type ProjectFormValues = {
  name: string;
  description: string;
  colorKey: ProjectColorKey;
  iconKey: ProjectIconKey;
};

export default function ProjectFormDialog({
  open,
  mode,
  project,
  saving,
  error,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  mode: "create" | "edit";
  project?: ProjectOut | null;
  saving: boolean;
  error?: string | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: ProjectFormValues) => void | Promise<void>;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [colorKey, setColorKey] = useState<ProjectColorKey>("teal");
  const [iconKey, setIconKey] = useState<ProjectIconKey>("flask");
  const [nameTouched, setNameTouched] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(project?.name ?? "");
    setDescription(project?.description ?? "");
    setColorKey(project?.color_key ?? "teal");
    setIconKey(project?.icon_key ?? "flask");
    setNameTouched(false);
  }, [open, project]);

  const normalizedName = name.trim();
  const nameError = nameTouched && !normalizedName ? "กรุณากรอกชื่อโปรเจกต์" : null;

  const submit = () => {
    setNameTouched(true);
    if (!normalizedName || saving) return;
    void onSubmit({
      name: normalizedName,
      description: description.trim(),
      colorKey,
      iconKey,
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!saving) onOpenChange(nextOpen);
      }}
    >
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] gap-0 overflow-y-auto overscroll-contain rounded-xl p-0 sm:max-w-lg sm:rounded-2xl"
        onEscapeKeyDown={(event) => {
          if (saving) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (saving) event.preventDefault();
        }}
      >
        <DialogHeader className="border-b px-4 pb-3 pt-4 pr-12 text-left sm:px-6 sm:pb-4 sm:pt-5">
          <DialogTitle className="text-base sm:text-lg">
            {mode === "create" ? "สร้างโปรเจกต์ใหม่" : "แก้ไขโปรเจกต์"}
          </DialogTitle>
          <DialogDescription className="text-xs leading-5 sm:text-sm">
            {mode === "create"
              ? "ตั้งชื่อและเลือกรูปแบบเพื่อแยกงานแต่ละโปรเจกต์ให้ชัดเจน"
              : "ปรับชื่อ คำอธิบาย สี และไอคอนของโปรเจกต์นี้"}
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4 px-4 py-4 sm:space-y-5 sm:px-6 sm:py-5"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="project-form-name">
                ชื่อโปรเจกต์ <span className="text-destructive">*</span>
              </Label>
              <span className="text-xs tabular-nums text-muted-foreground">
                {name.length}/100
              </span>
            </div>
            <Input
              id="project-form-name"
              autoFocus
              value={name}
              maxLength={100}
              aria-invalid={Boolean(nameError)}
              aria-describedby={nameError ? "project-form-name-error" : undefined}
              placeholder="เช่น Moisturizer Safety Screening"
              className="h-10 sm:h-11"
              onBlur={() => setNameTouched(true)}
              onChange={(event) => setName(event.target.value)}
            />
            {nameError && (
              <p id="project-form-name-error" role="alert" className="text-xs text-destructive">
                {nameError}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="project-form-description">คำอธิบาย</Label>
              <span className="text-xs tabular-nums text-muted-foreground">
                {description.length}/500
              </span>
            </div>
            <Textarea
              id="project-form-description"
              value={description}
              maxLength={500}
              rows={2}
              placeholder="อธิบายวัตถุประสงค์หรือรายละเอียดของโปรเจกต์"
              className="min-h-20 resize-none"
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>

          <div className="space-y-3 border-t pt-3 sm:space-y-4 sm:pt-4">
            <fieldset className="space-y-2">
              <legend className="text-xs font-normal text-muted-foreground">
                สีประจำโปรเจกต์
              </legend>
              <div className="grid grid-cols-5 justify-items-center gap-1 sm:flex sm:flex-wrap sm:justify-start sm:gap-1.5">
                {PROJECT_COLORS.map((item) => {
                  const selected = item.key === colorKey;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      title={item.label}
                      aria-label={`เลือกสี${item.label}`}
                      aria-pressed={selected}
                      className={cn(
                        "grid size-9 place-items-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:size-8",
                        selected
                          ? "bg-muted ring-1 ring-primary/30"
                          : "hover:bg-muted/70",
                      )}
                      onClick={() => setColorKey(item.key)}
                    >
                      <span
                        className={cn(
                          "grid size-5 place-items-center rounded-full",
                          item.swatch,
                        )}
                      >
                        {selected && (
                          <Check className="size-3 text-white" strokeWidth={3} />
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="text-xs font-normal text-muted-foreground">
                ไอคอนโปรเจกต์
              </legend>
              <div className="grid grid-cols-5 justify-items-center gap-1 sm:flex sm:flex-wrap sm:justify-start sm:gap-1.5">
                {PROJECT_ICONS.map((item) => {
                  const Icon = item.icon;
                  const selected = item.key === iconKey;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      title={item.label}
                      aria-label={`เลือกไอคอน${item.label}`}
                      aria-pressed={selected}
                      className={cn(
                        "grid size-9 place-items-center rounded-lg text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        selected
                          ? "bg-accent text-primary ring-1 ring-primary/20"
                          : "hover:bg-muted hover:text-foreground",
                      )}
                      onClick={() => setIconKey(item.key)}
                    >
                      <Icon className="size-4" />
                    </button>
                  );
                })}
              </div>
            </fieldset>
          </div>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <DialogFooter className="grid grid-cols-2 gap-2 border-t pt-4 sm:flex sm:gap-0 sm:pt-5">
            <Button
              type="button"
              variant="outline"
              className="h-10 w-full sm:h-11 sm:w-auto sm:min-w-24"
              disabled={saving}
              onClick={() => onOpenChange(false)}
            >
              ยกเลิก
            </Button>
            <Button
              type="submit"
              className="h-10 w-full gap-2 sm:h-11 sm:w-auto sm:min-w-32"
              disabled={saving || !normalizedName}
            >
              {saving && <LoaderCircle className="size-4 animate-spin" />}
              {mode === "create" ? "สร้างโปรเจกต์" : "บันทึกการแก้ไข"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
