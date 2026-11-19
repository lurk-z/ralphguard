"use client";

import { useState } from "react";
import { toast } from "sonner";
import { AlertCircle, AlertTriangle, AppWindow, BarChart3, CheckCircle2, ChevronRight, Info, FileSpreadsheet, FlaskConical, ScanLine, Search, MapPin, Microscope, Plus, Sparkles, Workflow } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarBadge, AvatarFallback, AvatarGroup, AvatarGroupCount, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

import BrandedProgressLoader from "@/components/shared/BrandedProgressLoader";
import { BrandLogo } from "@/components/kit/brand-logo";
import { BrushToolbar } from "@/components/kit/brush-toolbar";
import { FormulaCard, type FormulaIngredient } from "@/components/kit/formula-card";
import { PageHeader } from "@/components/kit/page-header";
import { ProjectList } from "@/components/kit/project-list";
import { ScoreList, type ScoreItem } from "@/components/kit/score-card";
import { SegmentedTabs } from "@/components/kit/segmented-tabs";
import { SeverityLegend } from "@/components/kit/severity-legend";
import { substanceDepictionUrl } from "@/lib/api";

import { DemoBody, Row } from "./_parts";

/* ------------------------------------------------------------------ */
/* ปุ่มและฟอร์ม                                                          */
/* ------------------------------------------------------------------ */

function Demo_button() {
  const [query, setQuery] = useState("");
  const [slider, setSlider] = useState([50]);
  const [hint, setHint] = useState(true);
  return (
    <DemoBody>
      <div className="space-y-4">
        <Row label="variant">
          <Button>สร้างโปรเจกต์</Button>
          <Button variant="secondary">ยกเลิก</Button>
          <Button variant="outline">แก้ไข</Button>
          <Button variant="ghost">ข้าม</Button>
          <Button variant="destructive">ลบ</Button>
          <Button variant="link">ดูเพิ่มเติม</Button>
        </Row>
        <Row label="size · icon · disabled">
          <Button size="sm">เล็ก</Button>
          <Button>ปกติ</Button>
          <Button size="lg">ใหญ่</Button>
          <Button size="icon" aria-label="เพิ่ม">
            <Plus />
          </Button>
          <Button>
            <Plus /> สร้างโปรเจกต์
          </Button>
          <Button disabled>กดไม่ได้</Button>
        </Row>
      </div>
    </DemoBody>
  );
}

function Demo_input() {
  const [query, setQuery] = useState("");
  return (
    <DemoBody>
      <div className="max-w-xs space-y-8">
        <Row label="ปกติ (ชื่อโปรเจกต์ในหน้าสร้าง/เปลี่ยนชื่อ ไม่มีตัวอย่างและไม่มีข้อความเตือน)">
          <Input aria-label="ชื่อโปรเจกต์" maxLength={100} />
        </Row>
        <Row label="ผิดพลาด (aria-invalid)">
          <Input type="number" defaultValue="120" aria-invalid="true" aria-label="ความเข้มข้น (%)" />
        </Row>
        <Row label="ปิดใช้งาน">
          <Input defaultValue="RG-2569-001" disabled aria-label="รหัสโปรเจกต์" />
        </Row>
        <Row label="ช่องค้นหา (search) — มีไอคอน และปุ่มล้างเมื่อพิมพ์">
          <Input search placeholder="ค้นหาโปรเจกต์" aria-label="ค้นหาโปรเจกต์" value={query} onChange={(e) => setQuery(e.target.value)} onClear={() => setQuery("")} />
        </Row>
        <Row label="มีไอคอนนำหน้า (start)">
          <Input start={<FlaskConical />} placeholder="ชื่อสาร เช่น Glycerin" aria-label="ชื่อสาร" />
        </Row>
        <Row label="มีหน่วยต่อท้าย (end) — ใช้ใน FormulaCard">
          <Input end="%" type="number" placeholder="0" aria-label="สัดส่วน" />
        </Row>
      </div>
    </DemoBody>
  );
}

function Demo_select() {
  const [query, setQuery] = useState("");
  const [slider, setSlider] = useState([50]);
  const [hint, setHint] = useState(true);
  return (
    <DemoBody>
      <Select>
        <SelectTrigger className="w-[180px]" aria-label="เลือกผลิตภัณฑ์">
          <SelectValue placeholder="เลือกประเภทผลิตภัณฑ์" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>ดูแลผิวหน้า</SelectLabel>
            <SelectItem value="cream">ครีม / โลชั่น</SelectItem>
            <SelectItem value="serum">เซรั่ม</SelectItem>
            <SelectItem value="toner">โทนเนอร์</SelectItem>
          </SelectGroup>
          <SelectSeparator />
          <SelectGroup>
            <SelectLabel>ทำความสะอาด</SelectLabel>
            <SelectItem value="cleanser">คลีนเซอร์</SelectItem>
            <SelectItem value="mask">มาสก์</SelectItem>
          </SelectGroup>
          <SelectSeparator />
          <SelectGroup>
            <SelectLabel>อื่น ๆ</SelectLabel>
            <SelectItem value="other">อื่น ๆ</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
    </DemoBody>
  );
}

function Demo_slider() {
  const [query, setQuery] = useState("");
  const [slider, setSlider] = useState([50]);
  const [hint, setHint] = useState(true);
  return (
    <DemoBody>
      <div className="max-w-sm space-y-2">
        <div className="flex justify-between text-sm">
          <span>ขนาดรอย</span>
          <span className="tabular-nums text-primary">{slider[0]}%</span>
        </div>
        <Slider value={slider} onValueChange={setSlider} min={10} max={100} step={1} aria-label="ขนาดรอย" />
      </div>
    </DemoBody>
  );
}


/* ------------------------------------------------------------------ */
/* การนำทางและโลโก้                                                      */
/* ------------------------------------------------------------------ */

function Demo_brand_logo() {
  const [mode, setMode] = useState<"assess" | "nodes">("assess");
  const [panel, setPanel] = useState<"results" | "assistant">("results");
  const [day, setDay] = useState<"1" | "3" | "7">("1");
  const [query, setQuery] = useState("");
  return (
    <DemoBody>
      <Row>
        <BrandLogo href={null} />
        <span aria-hidden="true" className="h-8 w-px bg-border" />
        <BrandLogo href={null} compact />
      </Row>
    </DemoBody>
  );
}

function Demo_segmented_tabs() {
  const [mode, setMode] = useState<"assess" | "nodes">("assess");
  const [panel, setPanel] = useState<"results" | "assistant">("results");
  const [day, setDay] = useState<"1" | "3" | "7">("1");
  const [query, setQuery] = useState("");
  return (
    <DemoBody>
      <div className="space-y-5">
        <Row label="line · เส้นใต้ (สลับมุมมอง)">
          <SegmentedTabs
            label="โหมดทำงาน"
            value={mode}
            onChange={setMode}
            items={[
              { value: "assess", label: "ประเมิน", icon: FlaskConical },
              { value: "nodes", label: "Nodes", icon: Workflow },
            ]}
          />
          <SegmentedTabs
            label="แผงขวา"
            value={panel}
            onChange={setPanel}
            items={[
              { value: "results", label: "ผลทดสอบ" },
              { value: "assistant", label: "ผู้ช่วย AI", icon: Sparkles },
            ]}
          />
        </Row>
        <Row label="line · เต็มความกว้าง">
          <div className="w-full max-w-sm">
            <SegmentedTabs
              label="ช่วงเวลา"
              fullWidth
              value={day}
              onChange={setDay}
              items={[
                { value: "1", label: "Day 1" },
                { value: "3", label: "Day 3" },
                { value: "7", label: "Day 7" },
              ]}
            />
          </div>
        </Row>
        <Row label="pill · แคปซูลสลับ (สลับโหมด)">
          <SegmentedTabs
            variant="pill"
            label="โหมดทำงาน"
            value={mode}
            onChange={setMode}
            items={[
              { value: "assess", label: "ประเมิน", icon: FlaskConical },
              { value: "nodes", label: "Nodes", icon: Workflow },
            ]}
          />
        </Row>
        <Row label="pill · เต็มความกว้าง">
          <div className="w-full max-w-sm">
            <SegmentedTabs
              variant="pill"
              label="ช่วงเวลา"
              fullWidth
              value={day}
              onChange={setDay}
              items={[
                { value: "1", label: "Day 1" },
                { value: "3", label: "Day 3" },
                { value: "7", label: "Day 7" },
              ]}
            />
          </div>
        </Row>
      </div>
    </DemoBody>
  );
}

function Demo_tabs() {
  const [mode, setMode] = useState<"assess" | "nodes">("assess");
  const [panel, setPanel] = useState<"results" | "assistant">("results");
  const [day, setDay] = useState<"1" | "3" | "7">("1");
  const [query, setQuery] = useState("");
  return (
    <DemoBody>
      <Tabs defaultValue="overview" className="max-w-md">
        <TabsList>
          <TabsTrigger value="overview">
            <AppWindow />
            ภาพรวม
          </TabsTrigger>
          <TabsTrigger value="metrics">
            <BarChart3 />
            ตัวชี้วัด
          </TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="text-sm text-muted-foreground">
          เนื้อหาแท็บภาพรวม
        </TabsContent>
        <TabsContent value="metrics" className="text-sm text-muted-foreground">
          เนื้อหาแท็บตัวชี้วัด
        </TabsContent>
      </Tabs>
    </DemoBody>
  );
}

function Demo_page_header() {
  const [mode, setMode] = useState<"assess" | "nodes">("assess");
  const [panel, setPanel] = useState<"results" | "assistant">("results");
  const [day, setDay] = useState<"1" | "3" | "7">("1");
  const [query, setQuery] = useState("");
  return (
    <DemoBody>
      <PageHeader
        title="โปรเจกต์ทั้งหมด"
        description="เลือกโปรเจกต์เพื่อจัดการสูตรและดูผลประเมิน"
        actions={
          <>
            <Input search placeholder="ค้นหาโปรเจกต์" aria-label="ค้นหาโปรเจกต์" value={query} onChange={(e) => setQuery(e.target.value)} onClear={() => setQuery("")} containerClassName="flex-1 sm:w-64 sm:flex-none" />
            <Button className="h-11 sm:h-10">
              <Plus /> สร้างโปรเจกต์
            </Button>
          </>
        }
      />
    </DemoBody>
  );
}


/* ------------------------------------------------------------------ */
/* Overlay                                                              */
/* ------------------------------------------------------------------ */

function Demo_dialog() {
  return (
    <DemoBody>
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="outline">สร้างโปรเจกต์</Button>
        </DialogTrigger>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>สร้างโปรเจกต์ใหม่</DialogTitle>
          </DialogHeader>
          <Input aria-label="ชื่อโปรเจกต์" maxLength={100} />
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">ยกเลิก</Button>
            </DialogClose>
            <Button>สร้างโปรเจกต์</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DemoBody>
  );
}

function Demo_alert_dialog() {
  return (
    <DemoBody>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="destructive">ลบโปรเจกต์</Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ลบ “Test-skincare” ใช่ไหม?</AlertDialogTitle>
            <AlertDialogDescription>สูตรและผลประเมินในโปรเจกต์นี้จะถูกลบด้วย ย้อนกลับไม่ได้</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90">ลบ</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DemoBody>
  );
}

function Demo_dropdown_menu() {
  return (
    <DemoBody>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline">บัญชี</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48">
          <DropdownMenuLabel>นักวิจัย</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem>ตั้งค่า</DropdownMenuItem>
          <DropdownMenuItem>ประวัติ</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-destructive">ออกจากระบบ</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </DemoBody>
  );
}

function Demo_popover() {
  return (
    <DemoBody>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline">ตั้งค่าสูตร</Button>
        </PopoverTrigger>
        <PopoverContent className="w-52 p-1.5">
          {["แก้ไขสูตร", "คัดลอกและวาง", "ลบสูตร"].map((label) => (
            <button
              key={label}
              type="button"
              className="flex h-10 w-full items-center rounded-lg px-2.5 text-left text-sm hover:bg-accent"
            >
              {label}
            </button>
          ))}
        </PopoverContent>
      </Popover>
    </DemoBody>
  );
}

function Demo_tooltip() {
  return (
    <DemoBody>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="icon" variant="outline" aria-label="เพิ่มสาร">
              <Plus />
            </Button>
          </TooltipTrigger>
          <TooltipContent>เพิ่มสาร</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </DemoBody>
  );
}

function Demo_sonner() {
  return (
    <DemoBody>
      <Row>
        <Button variant="outline" onClick={() => toast.success("บันทึกสูตรแล้ว")}>
          สำเร็จ
        </Button>
        <Button variant="outline" onClick={() => toast.warning("บริเวณนี้มีรอยจากกล่องสูตรอื่นแล้ว")}>
          เตือน
        </Button>
        <Button variant="outline" onClick={() => toast.error("ประเมินไม่สำเร็จ ลองใหม่อีกครั้ง")}>
          ผิดพลาด
        </Button>
      </Row>
    </DemoBody>
  );
}


/* ------------------------------------------------------------------ */
/* แสดงผล                                                               */
/* ------------------------------------------------------------------ */

function Demo_card() {
  return (
    <DemoBody>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>สูตร A</CardTitle>
            <CardDescription>ครีม / โลชั่น · 2 สาร</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">ประเมินล่าสุด 13 พ.ย. 2569 · ผิว 39/100 ระดับกลาง</CardContent>
          <CardFooter className="gap-2">
            <Button size="sm">เปิดสูตร</Button>
            <Button size="sm" variant="outline">
              แก้ไข
            </Button>
          </CardFooter>
        </Card>
        <Card>
          <CardHeader className="border-b">
            <CardTitle>
              <FlaskConical />
              สารในสูตร A
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <div className="flex items-center justify-between">
              <span>Glycolic Acid</span>
              <span className="tabular-nums text-muted-foreground">5%</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Glycerin</span>
              <span className="tabular-nums text-muted-foreground">3%</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Water (Base)</span>
              <span className="tabular-nums text-muted-foreground">92%</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </DemoBody>
  );
}

function Demo_badge() {
  return (
    <DemoBody>
      <Row>
        <Badge>ค่าเริ่มต้น</Badge>
        <Badge variant="secondary">1 สาร</Badge>
        <Badge variant="outline">ร่าง</Badge>
        <Badge variant="destructive">ระดับสูง</Badge>
      </Row>
    </DemoBody>
  );
}

function Demo_alert() {
  return (
    <DemoBody>
      <div className="grid max-w-xl gap-3">
        <Alert variant="warning">
          <AlertTriangle />
          <AlertTitle>สารรวมเต็ม 100% แล้ว</AlertTitle>
          <AlertDescription>กรุณาลดสัดส่วนสารบางตัวก่อนเพิ่มสารใหม่</AlertDescription>
        </Alert>
        <Alert variant="success">
          <CheckCircle2 />
          <AlertTitle>ประเมินสูตร A เสร็จแล้ว</AlertTitle>
          <AlertDescription>ดูผลระคายเคืองผิว ตา และการแพ้ได้ที่แผงผลทดสอบ</AlertDescription>
        </Alert>
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>ประเมินไม่สำเร็จ</AlertTitle>
          <AlertDescription>เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ลองใหม่อีกครั้ง</AlertDescription>
        </Alert>
        <Alert>
          <Info />
          <AlertTitle>แบบปกติ (ไม่มีสี)</AlertTitle>
          <AlertDescription>ผลนี้เป็นการคัดกรองเบื้องต้น ไม่ใช่ผลทดสอบจริง</AlertDescription>
        </Alert>
      </div>
    </DemoBody>
  );
}

function Demo_avatar() {
  return (
    <DemoBody>
      <div className="space-y-4">
        <Row label="ขนาด sm · default · lg">
          <Avatar size="sm">
            <AvatarImage src="/icons/logo.png" alt="RalphGuard" />
            <AvatarFallback>RG</AvatarFallback>
          </Avatar>
          <Avatar>
            <AvatarImage src="/icons/logo.png" alt="RalphGuard" />
            <AvatarFallback>RG</AvatarFallback>
          </Avatar>
          <Avatar size="lg">
            <AvatarImage src="/icons/logo.png" alt="RalphGuard" />
            <AvatarFallback>RG</AvatarFallback>
          </Avatar>
        </Row>
        <Row label="ไม่มีรูป → ตัวอักษรย่อ · มีป้ายสถานะ">
          <Avatar>
            <AvatarFallback>นว</AvatarFallback>
          </Avatar>
          <Avatar>
            <AvatarFallback>สม</AvatarFallback>
            <AvatarBadge className="bg-emerald-500" />
          </Avatar>
          <Avatar size="lg">
            <AvatarFallback>ทีม</AvatarFallback>
            <AvatarBadge className="bg-amber-500" />
          </Avatar>
        </Row>
        <Row label="กลุ่มสมาชิกโปรเจกต์">
          <AvatarGroup>
            <Avatar>
              <AvatarFallback>นว</AvatarFallback>
            </Avatar>
            <Avatar>
              <AvatarFallback>สม</AvatarFallback>
            </Avatar>
            <Avatar>
              <AvatarFallback>มน</AvatarFallback>
            </Avatar>
            <AvatarGroupCount>+3</AvatarGroupCount>
          </AvatarGroup>
        </Row>
      </div>
    </DemoBody>
  );
}

function Demo_table() {
  return (
    <DemoBody>
      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>สูตร</TableHead>
              <TableHead>บริเวณ</TableHead>
              <TableHead className="text-right">คะแนนผิว</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell>สูตร A</TableCell>
              <TableCell>ใบหน้า</TableCell>
              <TableCell className="text-right tabular-nums">39</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>สูตร B</TableCell>
              <TableCell>มือ</TableCell>
              <TableCell className="text-right tabular-nums">22</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </DemoBody>
  );
}

function Demo_progress() {
  return (
    <DemoBody>
      <div className="max-w-sm space-y-4">
        <Progress value={62} aria-label="ความคืบหน้า" />
        <div className="flex items-center gap-3">
          <Skeleton className="size-10 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      </div>
    </DemoBody>
  );
}

function Demo_empty() {
  return (
    <DemoBody>
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FlaskConical />
          </EmptyMedia>
          <EmptyTitle>ยังไม่มีสูตร</EmptyTitle>
          <EmptyDescription>สร้างสูตรใหม่เพื่อเพิ่มสารและเริ่มการประเมิน</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button>
            <Plus /> สร้างสูตร
          </Button>
        </EmptyContent>
      </Empty>
    </DemoBody>
  );
}


/* ------------------------------------------------------------------ */
/* หน้าโปรเจกต์                                                          */
/* ------------------------------------------------------------------ */

function Demo_project_list() {
  return (
    <DemoBody>
      <ProjectList
        projects={[
          { id: "1", name: "Test-skincare", createdAt: "13 พ.ย. 2569", createdAtISO: "2026-11-13" },
          {
            id: "2",
            name: "Gentle cleanser",
            icon: Microscope,
            createdAt: "2 พ.ย. 2569",
            updatedAt: "12 พ.ย. 2569",
            createdAtISO: "2026-11-02",
            updatedAtISO: "2026-11-12",
          },
        ]}
        onOpen={(p) => toast("เปิด " + p.name)}
        onEdit={(p) => toast("แก้ไข " + p.name)}
        onDelete={(p) => toast("ลบ " + p.name)}
      />
    </DemoBody>
  );
}


/* ------------------------------------------------------------------ */
/* หน้าประเมิน                                                           */
/* ------------------------------------------------------------------ */

const DEMO_SCORES: ScoreItem[] = [
  { key: "skin", label: "ระคายเคืองผิว", score: 39, band: "moderate", confidence: "medium" },
  { key: "eye", label: "ระคายเคืองตา", score: 20, band: "low", confidence: "high" },
  { key: "sens", label: "แพ้ผิวหนัง", score: 11, band: "low", confidence: "medium" },
  { key: "acute", label: "พิษเฉียบพลันต่อร่างกาย", score: 22, band: "low", confidence: "low" },
  {
    key: "skin_dryness",
    label: "ศักยภาพทำให้ผิวแห้ง",
    score: 51,
    band: "high",
    confidence: "medium",
    note: "โมเดลทดลองสำหรับคัดกรอง ยังไม่ผ่านเกณฑ์เลื่อนเป็น production",
  },
];

function Demo_formula_card() {
  const [expanded, setExpanded] = useState(true);
  const [items, setItems] = useState<FormulaIngredient[]>([
    { name: "Glycolic Acid", smiles: "OCC(=O)O", percent: 5, property: "ผลัดเซลล์ผิว ลดความหมองคล้ำ" },
    { name: "Glycerin", smiles: "OCC(O)CO", percent: 3, property: "ให้ความชุ่มชื้น" },
  ]);
  const total = items.reduce((sum, item) => sum + (Number.isFinite(item.percent) ? item.percent : 0), 0);
  const base = Math.max(0, Math.round((100 - total) * 10) / 10);
  const [day, setDay] = useState<"1" | "3" | "7">("1");
  const [brush, setBrush] = useState(50);
  const [erase, setErase] = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [completed, setCompleted] = useState(false);

  return (
    <DemoBody>
      <div className="max-w-sm">
        <FormulaCard
          name="สูตร A"
          productType="ครีม / โลชั่น"
          active
          expanded={expanded}
          onToggle={() => setExpanded((v) => !v)}
          onSettings={() => toast("ตั้งค่าสูตร")}
          basePercent={base}
          warning={total >= 100 ? "สารรวมเต็ม 100% แล้ว กรุณาลดสัดส่วนสาร" : undefined}
          ingredients={items}
          onPercentChange={(index, percent) =>
            setItems((list) => list.map((item, i) => (i === index ? { ...item, percent } : item)))
          }
          onRemove={(index) => setItems((list) => list.filter((_, i) => i !== index))}
          onAdd={() =>
            setItems((list) => [...list, { name: "Niacinamide", smiles: "NC(=O)c1cccnc1", percent: 2, property: "ปรับสีผิวให้สม่ำเสมอ ลดความมัน" }])
          }
        />
      </div>
    </DemoBody>
  );
}

function Demo_score_card() {
  const [expanded, setExpanded] = useState(true);
  const [items, setItems] = useState<FormulaIngredient[]>([
    { name: "Glycolic Acid", smiles: "OCC(=O)O", percent: 5, property: "ผลัดเซลล์ผิว ลดความหมองคล้ำ" },
    { name: "Glycerin", smiles: "OCC(O)CO", percent: 3, property: "ให้ความชุ่มชื้น" },
  ]);
  const total = items.reduce((sum, item) => sum + (Number.isFinite(item.percent) ? item.percent : 0), 0);
  const base = Math.max(0, Math.round((100 - total) * 10) / 10);
  const [day, setDay] = useState<"1" | "3" | "7">("1");
  const [brush, setBrush] = useState(50);
  const [erase, setErase] = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [completed, setCompleted] = useState(false);

  return (
    <DemoBody>
      <div className="max-w-sm space-y-3">
        <SegmentedTabs
          label="ช่วงเวลา"
          fullWidth
          value={day}
          onChange={setDay}
          items={[
            { value: "1", label: "Day 1" },
            { value: "3", label: "Day 3" },
            { value: "7", label: "Day 7" },
          ]}
        />
        <ScoreList
          caption="ใบหน้า"
          items={DEMO_SCORES.map((item) => {
            // Demo only: change the day to watch the numbers count up or down.
            const score = item.score === null ? null : Math.min(100, Math.round(item.score * (day === "1" ? 1 : day === "3" ? 1.4 : 0.6)));
            const band = score === null ? item.band : score < 25 ? "low" : score < 50 ? "moderate" : score < 75 ? "high" : "severe";
            return { ...item, score, band };
          })}
        />
        <p className="text-xs text-muted-foreground">ตัวเลขเป็นข้อมูลตัวอย่าง ไม่ใช่ผลประเมินจริง</p>
      </div>
    </DemoBody>
  );
}

function Demo_severity_legend() {
  const [expanded, setExpanded] = useState(true);
  const [items, setItems] = useState<FormulaIngredient[]>([
    { name: "Glycolic Acid", smiles: "OCC(=O)O", percent: 5, property: "ผลัดเซลล์ผิว ลดความหมองคล้ำ" },
    { name: "Glycerin", smiles: "OCC(O)CO", percent: 3, property: "ให้ความชุ่มชื้น" },
  ]);
  const total = items.reduce((sum, item) => sum + (Number.isFinite(item.percent) ? item.percent : 0), 0);
  const base = Math.max(0, Math.round((100 - total) * 10) / 10);
  const [day, setDay] = useState<"1" | "3" | "7">("1");
  const [brush, setBrush] = useState(50);
  const [erase, setErase] = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [completed, setCompleted] = useState(false);

  return (
    <DemoBody>
      <SeverityLegend />
    </DemoBody>
  );
}

function Demo_brush_toolbar() {
  const [expanded, setExpanded] = useState(true);
  const [items, setItems] = useState<FormulaIngredient[]>([
    { name: "Glycolic Acid", smiles: "OCC(=O)O", percent: 5, property: "ผลัดเซลล์ผิว ลดความหมองคล้ำ" },
    { name: "Glycerin", smiles: "OCC(O)CO", percent: 3, property: "ให้ความชุ่มชื้น" },
  ]);
  const total = items.reduce((sum, item) => sum + (Number.isFinite(item.percent) ? item.percent : 0), 0);
  const base = Math.max(0, Math.round((100 - total) * 10) / 10);
  const [day, setDay] = useState<"1" | "3" | "7">("1");
  const [brush, setBrush] = useState(50);
  const [erase, setErase] = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [completed, setCompleted] = useState(false);

  return (
    <DemoBody>
      <BrushToolbar
        brushSize={brush}
        onBrushSizeChange={setBrush}
        eraseMode={erase}
        onToggleErase={() => setErase((v) => !v)}
        onClearAll={() => toast("ลบรอยทั้งหมด")}
        assessing={assessing}
        completed={completed}
        onAssess={() => {
          setErase(false);
          setAssessing(true);
          window.setTimeout(() => {
            setAssessing(false);
            setCompleted(true);
          }, 1200);
        }}
      />
    </DemoBody>
  );
}


/* ------------------------------------------------------------------ */
/* ชิ้นเดิมของระบบ                                                       */
/* ------------------------------------------------------------------ */

function Demo_branded_progress_loader() {
  return (
    <DemoBody>
      <div className="relative h-56 overflow-hidden rounded-xl border bg-white">
        <BrandedProgressLoader fullScreen={false} label="กำลังโหลดโมเดล 3 มิติ" />
      </div>
    </DemoBody>
  );
}


export const DEMOS: Record<string, () => JSX.Element> = {
  "button": Demo_button,
  "input": Demo_input,
  "select": Demo_select,
  "slider": Demo_slider,
  "brand-logo": Demo_brand_logo,
  "segmented-tabs": Demo_segmented_tabs,
  "tabs": Demo_tabs,
  "page-header": Demo_page_header,
  "dialog": Demo_dialog,
  "alert-dialog": Demo_alert_dialog,
  "dropdown-menu": Demo_dropdown_menu,
  "popover": Demo_popover,
  "tooltip": Demo_tooltip,
  "sonner": Demo_sonner,
  "card": Demo_card,
  "badge": Demo_badge,
  "alert": Demo_alert,
  "avatar": Demo_avatar,
  "table": Demo_table,
  "progress": Demo_progress,
  "empty": Demo_empty,
  "project-list": Demo_project_list,
  "formula-card": Demo_formula_card,
  "score-card": Demo_score_card,
  "severity-legend": Demo_severity_legend,
  "brush-toolbar": Demo_brush_toolbar,
  "branded-progress-loader": Demo_branded_progress_loader,
};

