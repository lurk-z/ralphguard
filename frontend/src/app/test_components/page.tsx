'use client'

import dynamic from 'next/dynamic'

const Text3DTest = dynamic(() => import('./_Text3DTest'), { ssr: false })

export default function TestComponentsPage() {
  return (
    <div className="min-h-screen bg-[#070b0c] flex flex-col">
      <div className="px-6 py-4 border-b border-white/10">
        <p className="font-mono text-xs text-brand/60 uppercase tracking-widest">
          Test Components
        </p>
        <h1 className="font-sans text-xl font-bold text-foreground mt-1">
          Text3D — LINE Seed Sans TH Bold
        </h1>
      </div>

      <div className="flex-1">
        <Text3DTest />
      </div>
    </div>
  )
}
