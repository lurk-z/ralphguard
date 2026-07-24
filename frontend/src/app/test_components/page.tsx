'use client'

import dynamic from 'next/dynamic'
import { useState } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from '@/components/ui/sidebar'
import { FlaskConical, Settings, HelpCircle, LayoutGrid, ChevronDown, Beaker, PackageOpen } from 'lucide-react'
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
} from '@/components/ui/alert-dialog'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Progress } from '@/components/ui/progress'
import { Slider } from '@/components/ui/slider'
import { Toaster } from '@/components/ui/sonner'
import { toast } from 'sonner'
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from '@/components/ui/empty'

const Text3DTest = dynamic(() => import('./_Text3DTest'), { ssr: false })

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="text-xs font-mono font-semibold uppercase tracking-widest text-muted-foreground border-b border-border pb-2">
        {title}
      </h2>
      <div className="flex flex-wrap items-start gap-3">{children}</div>
    </section>
  )
}

export default function TestComponentsPage() {
  const [sw, setSw] = useState(true)
  const [progress, setProgress] = useState(65)
  const [sliderVal, setSliderVal] = useState([40])

  return (
    <div className="app-light min-h-screen bg-background text-foreground">
      <Toaster />
      <header className="sticky top-0 z-30 border-b border-border bg-card px-6 py-4">
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          RalphGuard · Design System
        </p>
        <h1 className="mt-0.5 text-xl font-bold text-foreground">UI Components</h1>
      </header>

      <main className="mx-auto max-w-5xl space-y-10 px-6 py-10">

        <Section title="Button">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
          <Button size="sm">Small</Button>
          <Button size="lg">Large</Button>
          <Button disabled>Disabled</Button>
        </Section>

        <Section title="Badge">
          <Badge>Default</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="outline">Outline</Badge>
          <Badge variant="destructive">Destructive</Badge>
        </Section>

        <Section title="Input · Label · Textarea">
          <div className="flex flex-col gap-1.5 w-56">
            <Label htmlFor="test-input">ชื่อสูตร</Label>
            <Input id="test-input" placeholder="กรอกชื่อสูตร…" />
          </div>
          <div className="flex flex-col gap-1.5 w-56">
            <Label htmlFor="test-textarea">คำอธิบาย</Label>
            <Textarea id="test-textarea" placeholder="รายละเอียด…" rows={3} />
          </div>
        </Section>

        <Section title="Switch">
          <div className="flex items-center gap-2">
            <Switch id="sw1" checked={sw} onCheckedChange={setSw} />
            <Label htmlFor="sw1">{sw ? 'เปิด' : 'ปิด'}</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="sw2" checked={false} onCheckedChange={() => {}} disabled />
            <Label htmlFor="sw2">Disabled</Label>
          </div>
        </Section>

        <Section title="Avatar">
          <Avatar>
            <AvatarImage src="https://github.com/shadcn.png" alt="shadcn" />
            <AvatarFallback>SC</AvatarFallback>
          </Avatar>
          <Avatar>
            <AvatarFallback>TS</AvatarFallback>
          </Avatar>
        </Section>

        <Section title="Skeleton">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-4 w-24" />
          </div>
          <Skeleton className="size-12 rounded-full" />
        </Section>

        <Section title="Separator">
          <div className="w-full space-y-2">
            <p className="text-sm text-foreground">ข้อความด้านบน</p>
            <Separator />
            <p className="text-sm text-muted-foreground">ข้อความด้านล่าง</p>
          </div>
        </Section>

        <Section title="Tooltip">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline">Hover ดูนี่</Button>
              </TooltipTrigger>
              <TooltipContent className="text-white">นี่คือ Tooltip</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </Section>

        <Section title="Card">
          <Card className="w-64">
            <CardHeader className="pb-2">
              <p className="text-sm font-semibold text-foreground">Water (Aqua)</p>
              <p className="font-mono text-[11px] text-muted-foreground">CAS 7732-18-5</p>
            </CardHeader>
            <CardContent>
              <Badge>ตัวทำละลายหลัก</Badge>
            </CardContent>
          </Card>
        </Section>

        <Section title="Tabs">
          <Tabs defaultValue="a" className="w-72">
            <TabsList className="w-full">
              <TabsTrigger value="a" className="flex-1">การทดลอง</TabsTrigger>
              <TabsTrigger value="b" className="flex-1">โหนดโมเดล</TabsTrigger>
            </TabsList>
            <TabsContent value="a">
              <p className="text-sm text-muted-foreground pt-2">เนื้อหาการทดลอง</p>
            </TabsContent>
            <TabsContent value="b">
              <p className="text-sm text-muted-foreground pt-2">เนื้อหาโหนดโมเดล</p>
            </TabsContent>
          </Tabs>
        </Section>

        <Section title="Dialog">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline">เปิด Dialog</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>ยืนยันการดำเนินการ</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">คุณต้องการดำเนินการนี้หรือไม่?</p>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline">ยกเลิก</Button>
                <Button>ยืนยัน</Button>
              </div>
            </DialogContent>
          </Dialog>
        </Section>

        <Section title="Dropdown Menu">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2">
                ตัวเลือก <ChevronDown className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem>แก้ไข</DropdownMenuItem>
              <DropdownMenuItem>ทำสำเนา</DropdownMenuItem>
              <DropdownMenuItem className="text-destructive">ลบ</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </Section>

        <Section title="Sheet">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline">เปิด Sheet</Button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>รายละเอียดสูตร</SheetTitle>
              </SheetHeader>
              <p className="mt-4 text-sm text-muted-foreground">
                Sheet เลื่อนเข้ามาจากด้านขวา ใช้สำหรับ detail panel
              </p>
            </SheetContent>
          </Sheet>
        </Section>

        <Section title="Sidebar (Icon Rail Preview)">
          <div className="h-64 w-14 rounded-xl border border-border overflow-hidden">
            <SidebarProvider>
              <Sidebar collapsible="none" className="h-full w-14 bg-card">
                <SidebarContent className="py-2">
                  <SidebarMenu className="items-center gap-1">
                    {[
                      { icon: FlaskConical, label: 'ทดลอง' },
                      { icon: Beaker, label: 'สูตร' },
                      { icon: LayoutGrid, label: 'เทมเพลต' },
                      { icon: Settings, label: 'ตั้งค่า' },
                      { icon: HelpCircle, label: 'ช่วยเหลือ' },
                    ].map(({ icon: Icon, label }, i) => (
                      <SidebarMenuItem key={label}>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <SidebarMenuButton isActive={i === 0} className="size-10 justify-center p-0">
                                <Icon className="size-[18px]" />
                              </SidebarMenuButton>
                            </TooltipTrigger>
                            <TooltipContent side="right" className="text-white">{label}</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarContent>
              </Sidebar>
            </SidebarProvider>
          </div>
        </Section>

        <Section title="Text3D — LINE Seed Sans TH Bold">
          <div className="w-full rounded-xl overflow-hidden border border-border" style={{ height: 320 }}>
            <Text3DTest />
          </div>
        </Section>

        {/* ── Alert Dialog ── */}
        <Section title="Alert Dialog">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive">ลบโปรเจ็ค</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>คุณแน่ใจหรือไม่?</AlertDialogTitle>
                <AlertDialogDescription>
                  การดำเนินการนี้ไม่สามารถย้อนกลับได้ โปรเจ็คและข้อมูลทั้งหมดจะถูกลบอย่างถาวร
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
                <AlertDialogAction>ยืนยันลบ</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </Section>

        {/* ── Drawer ── */}
        <Section title="Drawer">
          <Drawer>
            <DrawerTrigger asChild>
              <Button variant="outline">เปิด Drawer</Button>
            </DrawerTrigger>
            <DrawerContent>
              <DrawerHeader>
                <DrawerTitle>รายละเอียดสูตร</DrawerTitle>
              </DrawerHeader>
              <div className="p-4 text-sm text-muted-foreground">
                Drawer เลื่อนขึ้นมาจากด้านล่าง เหมาะสำหรับ mobile-first UI
              </div>
            </DrawerContent>
          </Drawer>
        </Section>

        {/* ── Popover ── */}
        <Section title="Popover">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline">เปิด Popover</Button>
            </PopoverTrigger>
            <PopoverContent>
              <p className="text-sm font-medium text-foreground">ตัวเลือกสารเคมี</p>
              <p className="mt-1 text-xs text-muted-foreground">เลือกสารเคมีที่ต้องการเพิ่มลงในสูตร</p>
            </PopoverContent>
          </Popover>
        </Section>

        {/* ── Progress ── */}
        <Section title="Progress">
          <div className="w-full space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-foreground">ความคืบหน้า</span>
              <span className="font-mono text-muted-foreground">{progress}%</span>
            </div>
            <Progress value={progress} />
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setProgress(Math.max(0, progress - 10))}>− 10</Button>
              <Button size="sm" variant="outline" onClick={() => setProgress(Math.min(100, progress + 10))}>+ 10</Button>
            </div>
          </div>
        </Section>

        {/* ── Slider ── */}
        <Section title="Slider">
          <div className="w-72 space-y-3">
            <Slider
              value={sliderVal}
              onValueChange={setSliderVal}
              min={0}
              max={100}
              step={1}
            />
            <p className="font-mono text-sm text-muted-foreground">ค่า: {sliderVal[0]}</p>
          </div>
        </Section>

        {/* ── Sonner (Toast) ── */}
        <Section title="Sonner (Toast)">
          <Button onClick={() => toast('บันทึกสำเร็จแล้ว')}>Toast Default</Button>
          <Button variant="outline" onClick={() => toast.success('สร้างสูตรสำเร็จ')}>Toast Success</Button>
          <Button variant="outline" onClick={() => toast.error('เกิดข้อผิดพลาด')}>Toast Error</Button>
          <Button variant="outline" onClick={() => toast.warning('คำเตือน: ความเข้มเกินมาตรฐาน')}>Toast Warning</Button>
        </Section>

        {/* ── Empty State ── */}
        <Section title="Empty State">
          <div className="w-full rounded-xl border border-dashed border-border">
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <PackageOpen />
                </EmptyMedia>
                <EmptyTitle>ยังไม่มีสูตร</EmptyTitle>
                <EmptyDescription>สร้างสูตรใหม่เพื่อเริ่มการทดลองสารเคมี</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button>สร้างสูตรแรก</Button>
              </EmptyContent>
            </Empty>
          </div>
        </Section>

      </main>
    </div>
  )
}
