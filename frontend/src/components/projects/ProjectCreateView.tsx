"use client";

import { useLayoutEffect, useRef, useState } from "react";
import gsap from "gsap";
import { Check, LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ProjectColorKey, ProjectIconKey } from "@/lib/api";
import {
  PROJECT_COLORS,
  PROJECT_ICONS,
} from "@/lib/project-appearance";
import { cn } from "@/lib/utils";

import type { ProjectFormValues } from "./ProjectFormDialog";

export default function ProjectCreateView({
  saving,
  error,
  onCancel,
  onSubmit,
}: {
  saving: boolean;
  error?: string | null;
  onCancel: () => void;
  onSubmit: (values: ProjectFormValues) => void | Promise<void>;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [colorKey, setColorKey] = useState<ProjectColorKey>("teal");
  const [iconKey, setIconKey] = useState<ProjectIconKey>("flask");
  const [nameTouched, setNameTouched] = useState(false);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const context = gsap.context(() => {
      gsap.from("[data-create-section]", {
        autoAlpha: 0,
        y: 10,
        duration: 0.24,
        stagger: 0.045,
        ease: "power2.out",
        clearProps: "all",
      });
    }, root);
    return () => context.revert();
  }, []);

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
    <div
      ref={rootRef}
      className="mx-auto w-full max-w-6xl px-4 py-2 sm:px-6 sm:py-4 lg:px-8"
    >
      <form
        className="min-w-0"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div className="grid gap-4 py-2 md:grid-cols-[minmax(0,3fr)_minmax(15rem,2fr)] md:gap-8 md:py-3 lg:gap-10">
          <section
            data-create-section
            aria-labelledby="project-information-title"
            className="flex min-w-0 flex-col"
          >


            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="project-create-name">
                    ชื่อโปรเจกต์ <span className="text-destructive">*</span>
                  </Label>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {name.length}/100
                  </span>
                </div>
                <Input
                  id="project-create-name"
                  autoFocus
                  value={name}
                  maxLength={100}
                  aria-invalid={Boolean(nameError)}
                  aria-describedby={nameError ? "project-create-name-error" : undefined}
                  placeholder="เช่น ครีมบำรุงผิว"
                  className="h-11 bg-background"
                  onChange={(event) => setName(event.target.value)}
                />
                {nameError && (
                  <p
                    id="project-create-name-error"
                    role="alert"
                    className="text-xs text-destructive"
                  >
                    {nameError}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="project-create-description">คำอธิบาย</Label>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {description.length}/500
                  </span>
                </div>
                <Textarea
                  id="project-create-description"
                  value={description}
                  maxLength={500}
                  rows={2}
                  placeholder="สรุปสูตรหรือวัตถุประสงค์"
                  className="min-h-20 resize-none bg-background md:min-h-24"
                  onChange={(event) => setDescription(event.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  ไม่จำเป็น สามารถเพิ่มภายหลังได้
                </p>
              </div>
            </div>

            <div
              data-create-section
              className="mt-6 hidden flex-col gap-3 border-t pt-4 md:flex md:flex-row md:items-center"
            >
              {error && (
                <p role="alert" className="text-sm text-destructive md:mr-auto">
                  {error}
                </p>
              )}
              <div className="ml-auto flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  className="h-10 min-w-24"
                  disabled={saving}
                  onClick={onCancel}
                >
                  ยกเลิก
                </Button>
                <Button
                  type="submit"
                  className="h-10 min-w-36 gap-2"
                  disabled={saving || !normalizedName}
                >
                  {saving && <LoaderCircle className="size-4 animate-spin" />}
                  สร้างโปรเจกต์
                </Button>
              </div>
            </div>
          </section>

          <section
            data-create-section
            aria-labelledby="project-appearance-title"
            className="min-w-0 max-w-full border-t pt-4 md:border-l md:border-t-0 md:pl-7 md:pt-0 lg:pl-9"
          >


            <fieldset className="min-w-0 space-y-2">
              <legend className="text-xs font-normal text-muted-foreground">
                สีประจำโปรเจกต์
              </legend>
              <div className="max-w-full rounded-xl bg-muted/30 p-1 md:bg-transparent md:p-0">
                <div className="grid grid-cols-5 gap-1 md:gap-1.5">
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
                          "grid size-9 shrink-0 place-items-center justify-self-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          selected
                            ? "bg-background ring-1 ring-primary/30"
                            : "hover:bg-background/80",
                        )}
                        onClick={() => setColorKey(item.key)}
                      >
                        <span className={cn("grid size-5 place-items-center rounded-full", item.swatch)}>
                          {selected && <Check className="size-3 text-white" strokeWidth={3} />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </fieldset>

            <fieldset className="mt-4 min-w-0 space-y-2">
              <legend className="text-xs font-normal text-muted-foreground">
                ไอคอนโปรเจกต์
              </legend>
              <div className="max-w-full rounded-xl bg-muted/30 p-1 md:bg-transparent md:p-0">
                <div className="grid grid-cols-5 gap-1 md:gap-1.5">
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
                          "grid size-10 shrink-0 place-items-center justify-self-center rounded-lg text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          selected
                            ? "bg-background text-primary ring-1 ring-primary/20"
                            : "hover:bg-background/80 hover:text-foreground",
                        )}
                        onClick={() => setIconKey(item.key)}
                      >
                        <Icon className="size-4" />
                      </button>
                    );
                  })}
                </div>
              </div>
            </fieldset>
          </section>

          <div
            data-create-section
            className="flex flex-col gap-3 border-t pt-3 md:hidden"
          >
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                className="h-10 min-w-20"
                disabled={saving}
                onClick={onCancel}
              >
                ยกเลิก
              </Button>
              <Button
                type="submit"
                className="h-10 min-w-36 gap-2"
                disabled={saving || !normalizedName}
              >
                {saving && <LoaderCircle className="size-4 animate-spin" />}
                สร้างโปรเจกต์
              </Button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
