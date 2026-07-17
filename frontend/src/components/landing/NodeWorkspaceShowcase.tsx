import Image from 'next/image'

export default function NodeWorkspaceShowcase() {
  return (
    <div
      data-node-workspace
      className="relative aspect-[2.055/1] w-[min(94vw,58rem)] min-w-0 overflow-hidden rounded-lg border border-white/90 bg-white shadow-[0_24px_70px_rgba(7,31,38,0.32)] sm:w-[min(88vw,58rem)] sm:rounded-xl xl:w-[min(62vw,58rem)]"
    >
      <Image
        src="/landing/node-workspace.png"
        alt="หน้า Node workspace สำหรับเลือกสาร เชื่อมสูตร และประเมินความเสี่ยง"
        width={1535}
        height={747}
        priority
        unoptimized
        data-node-screenshot
        className="pointer-events-none absolute left-0 top-[-10%] h-[133.5%] w-[126.5%] max-w-none select-none"
      />
      <div
        aria-hidden
        data-node-scan
        className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300 to-transparent opacity-0 shadow-[0_0_12px_rgba(103,232,249,0.85)]"
      />
    </div>
  )
}
