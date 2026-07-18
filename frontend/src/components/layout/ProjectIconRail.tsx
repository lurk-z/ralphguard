"use client";

// Persistent left icon rail for the project workspace — shared across
// assess / results / chemicals / templates so it never disappears when
// navigating between them (each of those pages just renders its own content
// next to this rail via the shared (dashboard)/projects/[id]/layout.tsx).
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Beaker,
  FlaskConical,
  Grid2x2,
  LayoutGrid,
  LineChart,
  SlidersHorizontal,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";

type RailItem = {
  icon: React.ElementType;
  label: string;
  // path segment appended to /projects/[id]/ — undefined means no route yet.
  segment?: string;
};

const FaceIcon = ({ className }: { className?: string }) => (
  <img src="/icons/person.png" alt="ทดลอง" className={className} />
);

const RAIL_ITEMS: RailItem[] = [
  { icon: FaceIcon, label: "ทดลอง", segment: "assess" },
  { icon: LineChart, label: "ผลลัพธ์", segment: "results" },
  { icon: FlaskConical, label: "สารเคมี", segment: "chemicals" },
  { icon: LayoutGrid, label: "เทมเพลต", segment: "templates" },
];

export default function ProjectIconRail({ projectId }: { projectId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [showHomeConfirm, setShowHomeConfirm] = useState(false);

  return (
    <>
      <div className="relative z-30 h-screen w-14 shrink-0 overflow-hidden bg-card">
        <Sidebar collapsible="none" className="h-screen w-14 border-r border-border bg-card">
          <SidebarContent className="gap-0 py-3">
            <div className="mb-1 flex flex-col items-center">
              <Tooltip>
                <TooltipTrigger asChild>
                  <SidebarMenuButton
                    size="default"
                    onClick={() => setShowHomeConfirm(true)}
                    className="size-10 justify-center p-0 text-muted-foreground hover:text-foreground active:scale-95"
                  >
                    <img
                      src="/icons/logo.svg"
                      alt=""
                      aria-hidden="true"
                      className="size-7 object-contain"
                    />
                  </SidebarMenuButton>
                </TooltipTrigger>
                <TooltipContent side="right" className="text-white">
                  กลับหน้าหลักโครงการ
                </TooltipContent>
              </Tooltip>
              <div className="mb-1.5 mt-2.5 h-px w-8 bg-border" />
            </div>

            <SidebarMenu className="items-center gap-1">
              {RAIL_ITEMS.map(({ icon: Icon, label, segment }) => {
                const href = segment ? `/projects/${projectId}/${segment}` : undefined;
                const isActive = !!href && pathname === href;
                return (
                  <SidebarMenuItem key={label}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <SidebarMenuButton
                          isActive={isActive}
                          size="default"
                          onClick={() => href && router.push(href)}
                          className="size-10 justify-center p-0"
                        >
                          <Icon className="size-[18px]" />
                        </SidebarMenuButton>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="text-white">
                        {label}
                      </TooltipContent>
                    </Tooltip>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarContent>
        </Sidebar>
      </div>

      <AlertDialog open={showHomeConfirm} onOpenChange={setShowHomeConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ต้องการกลับไปยังหน้ารายการโครงการหรือไม่?</AlertDialogTitle>
            <AlertDialogDescription>
              การจำลองและการทดสอบสารที่คุณทำไว้อาจไม่ได้รับการบันทึก
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => router.push("/projects")}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              กลับหน้าหลัก
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
